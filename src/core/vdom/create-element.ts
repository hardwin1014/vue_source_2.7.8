import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isArray,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset,
  isFunction
} from '../util/index'

import { normalizeChildren, simpleNormalizeChildren } from './helpers/index'
import type { Component } from 'types/component'
import type { VNodeData } from 'types/vnode'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
// creatElement所做的就是处理参数
export function createElement(
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  // 判断data是数组，或者是一个原始的值，其实就是children
  // 如果是数组的话，就是子节点
  // 如果是原始值的话，就是设置标签之间的内容
  if (isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined // data 没有传入
  }

  // 当用户传入render的时候，会将normalizationType设置为常量 2, 处理children这个参数
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }

  // vnode在这个函数中创建的，所以返回VNode类型
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement(
  context: Component,
  tag?: string | Component | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // 判断data是否为空，再判断data是否含有__ob__属性，如果有证明data是响应式的属性
  if (isDef(data) && isDef((data as any).__ob__)) {
    // 如果是开发环境，会报出一个警告，应该避免使用响应式的数据，如果data是响应式的，会调用createEmptyVnode创建一个空节点
    __DEV__ &&
      warn(
        `Avoid using observed data object as vnode data: ${JSON.stringify(
          data
        )}\n` + 'Always create fresh vnode data objects in each render!',
        context
      )
    return createEmptyVNode()
  }
  // <component v-bind: is = "currentTabComponent"></component>
  // object syntax in v-bind
  // 如果data中有is属性的话，会记录到tag属性中来
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  // 如果tag为false的话，相当于把is属性设置成了false，就返回一个空节点
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // 判断data是不是undefined或null，是否有key属性，key是不是原始值，会报一个警告，警告说key应该使用string、number类型的值
  if (__DEV__ && isDef(data) && isDef(data.key) && !isPrimitive(data.key)) {
    warn(
      'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
      context
    )
  }
  // support single function children as default scoped slot
  // 处理作用域插槽
  if (isArray(children) && isFunction(children[0])) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }

  //  如果是上面定义的2的话，说明是用户传过来的render函数
  if (normalizationType === ALWAYS_NORMALIZE) {
    // 返回一维数组，处理用户手写的render
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // 把二维数组，转换成一维数组
    children = simpleNormalizeChildren(children)
  }

  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 1. 是否是html的保留标签
    if (config.isReservedTag(tag)) {
      // platform built-in elements 平台内置的元素
      if (
        __DEV__ &&
        isDef(data) &&
        isDef(data.nativeOn) &&
        data.tag !== 'component'
      ) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      // 如果是html保留标签，就使用Vnode创建
      vnode = new VNode(
        config.parsePlatformTagName(tag),  // tag标签
        data,
        children,
        undefined,
        undefined,
        context // vue实例
      )
    //  2. 判断是否是自定义组件
    } else if (
      // 会判断data是否存在，data的pre是否为空，通过resolveAsset函数获取选项中的components中的标签，获取名称
      (!data || !data.pre) &&
      isDef((Ctor = resolveAsset(context.$options, 'components', tag)))
    ) {
      // 查找自定义组件构造函数的声明
      // 根据ctor创建组件的Vnode
      // component 组件创建
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 自定义标签
      vnode = new VNode(tag, data, children, undefined, undefined, context)
    }
  } else {
    // 组件
    // direct component options / constructor
    vnode = createComponent(tag as any, data, context, children)
  }

  // 如果是数组的话，直接返回Vnode对象
  if (isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    // 处理命名空间
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    // 返回Vnode对象
    return vnode
  } else {
    // 如果都不满足，返回一个空的Vnode对象
    return createEmptyVNode()
  }
}

function applyNS(vnode, ns, force?: boolean) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (
        isDef(child.tag) &&
        (isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))
      ) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings(data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
