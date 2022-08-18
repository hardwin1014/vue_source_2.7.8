import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'
import type { Component } from 'types/component'
import type { InternalComponentOptions } from 'types/options'
import { EffectScope } from 'v3/reactivity/effectScope'

let uid = 0

export function initMixin(Vue: typeof Component) {
  // 1. 给Vue实例增加 _init()方法，Vue的入口
  Vue.prototype._init = function (options?: Record<string, any>) {
    // 1.1 定义了vm常量，存储的是vue的实例
    const vm: Component = this
    // a uid 1.2是唯一标识
    vm._uid = uid++

    // 开发时的性能检测(省略)
    let startTag, endTag
    /* istanbul ignore if */
    if (__DEV__ && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // __isVue标识了当前属性是vue的实例, 目的是在设置响应式数据的时候（observer），不对他做处理
    vm._isVue = true
    // avoid instances from being observed
    vm.__v_skip = true
    // effect scope
    vm._scope = new EffectScope(true /* detached */)

    // 2. 合并 options / 初始化操作
    // 2.1 当是组件的时候，执行下面的
    if (options && options._isComponent) {
      // 优化内部组件实例化
      // 因为动态的选项合并是相当慢的，并且每一个内部组件选项需要特殊处理。
      initInternalComponent(vm, options as any)
    } else {
      // 把用户传入的options和之前vue构造函数的options进行合并
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor as any),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    // 如果是开发环境，调用initProxy，initProxy会判断是否有代理
    if (__DEV__) {
      initProxy(vm)
    } else {
      // 设置渲染时的代理对象，就是vue实例
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm

    initLifecycle(vm) // vue初始化跟生命周期相关的变量（$children\$parent\$root\$refs）
    initEvents(vm) // vue的事件监听初始化,父组件绑定在当前组件上的事件
    initRender(vm) // vue的编译render初始化($slots/ $scopedSlots/ _c / $createEke )

    // 第一个生命周期
    callHook(vm, 'beforeCreate', undefined, false /* setContext */) // beforeCreate生命钩子回调

    // 实现依赖注入和initProvider
    initInjections(vm) // 把inject的成员注入到vue上
    initState(vm) // 初始化vue的_props/methods/_data/computed/watch，并且把它们的成员都注入到了vue实例中来
    initProvide(vm) // 初始化provide

    // 第二个生命周期
    callHook(vm, 'created') // create 生命周期钩子回调

    /* istanbul ignore if */
    if (__DEV__ && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 挂载整个页面
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  const opts = (vm.$options = Object.create((vm.constructor as any).options))
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions!
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions(Ctor: typeof Component) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions(
  Ctor: typeof Component
): Record<string, any> | null {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
