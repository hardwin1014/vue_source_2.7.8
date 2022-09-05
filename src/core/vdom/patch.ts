/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/template-ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isArray,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

function sameVnode(a, b) {
  return (
    a.key === b.key &&
    a.asyncFactory === b.asyncFactory &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) && isUndef(b.asyncFactory.error)))
  )
}

function sameInputType(a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB))
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction(backend) {
  let i, j
  const cbs: any = {} // 存储模块中定义的钩子函数

  // modules  节点的属性、事件、样式的操作
  // nodeOps  节点操作
  const { modules, nodeOps } = backend

  // 先遍历hooks，hooks是一个数组，里面定义了钩子函数，
  for (i = 0; i < hooks.length; ++i) {
    // 把钩子函数的名称作为cbs的属性
    cbs[hooks[i]] = []
    // 遍历所有的modules
    for (j = 0; j < modules.length; ++j) {
      // 如果modules中定义了相关的钩子函数，然后把模块中的钩子函数取出来，放入钩子函数中对应的数组里面
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  // 返回Vnode对象，传入当前的DOM元素elm，会把当前的dom元素记录到当前的对象里面来
  function emptyNodeAt(elm) {
    // 创建虚拟DOM,
    // nodeOps.tagName(elm).toLowerCase()获取Vnode的值
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  function removeNode(el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  // 判断Vnode的标签是否是一个未知的标签
  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  function createElm(
    vnode,
    insertedVnodeQueue,
    parentElm?: any,// 挂载的父节点的真实位置
    refElm?: any,
    nested?: any,
    ownerArray?: any,
    index?: any
  ) {
    // 首先判断是否有elm属性，如果有证明曾经渲染过，ownerArray代表Vnode中有子节点
    // 此时要把Vnode克隆一份
    // （我们在调用creatElm的时候，只会传入前四个参数，所以不会进入这个if）
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // 为了避免一些潜在的错误
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    // 处理组件的情况，调用了createComponent
    vnode.isRootInsert = !nested // for transition enter check
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // 存储了Vnode中的data  children  tag，判断执行对应的函数
    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag

    // 1. 当前的tag就是标签名称，因为组件在上面已经处理过了
    if (isDef(tag)) {
      if (__DEV__) {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        // 如果是自定义标签的话，会报出警告
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          // tag 是一个自定义标签，你是否注册了对应的组件
          warn(
            'Unknown custom element: <' +
              tag +
              '> - did you ' +
              'register the component correctly? For recursive components, ' +
              'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      // 判断Vnode是否有ns (命名空间)，如果有就利用ns来创建对应的dom元素（处理svg的情况）
      // 创建好之后，会存储到Vnode.elm中
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode)

      // 给Vnode设置样式的作用域，给scope设置样式的id
      setScope(vnode)

      // 把Vnode中所有的子元素设置成真实的dom
      createChildren(vnode, children, insertedVnodeQueue)

      // 如果Vnode中的data有值的话，触发钩子函数
      if (isDef(data)) {
        // 因为当前已经创建好了dom对象
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      // 执行insert
      insert(parentElm, vnode.elm, refElm)

      if (__DEV__ && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      // 2. 判断Vnode是否是一个注释节点
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      // 3. Vnode是文本节点的时候
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  function initComponent(vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(
        insertedVnodeQueue,
        vnode.data.pendingInsert
      )
      vnode.data.pendingInsert = null
    }
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  function insert(parent, elm, ref) {
    // 看parent是否有定义，如果有定义就把dom元素挂载parent到上面来
    // 如果没有值的话，什么都不做，所以刚刚只是创建的组件，只是在内存中存储着，并没有挂载页面上
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  function createChildren(vnode, children, insertedVnodeQueue) {
    if (isArray(children)) {
      if (__DEV__) {
        // 判断children中是否有相同的key，如果有相同的key会警告，如果没有会记录当前的key
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(
          children[i],
          insertedVnodeQueue,
          vnode.elm,
          null,
          true,
          children,
          i
        )
      }
    } else if (isPrimitive(vnode.text)) {
      // 如果Vnode.text是原始值的话，先使用string转换成字符串，调用createTextNode创建text对象（dom元素），挂载到Vnode.elm上来
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  function isPatchable(vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    // 调用VNode的钩子函数
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    // 获取节点上的hook函数
    i = vnode.data.hook // Reuse variable
    // 调用组件的钩子函数
    if (isDef(i)) {
      // 如果有值的话， 就去触发hook的create函数
      if (isDef(i.create)) i.create(emptyNode, vnode)
      // 判断hook中是否有insert钩子函数，如果有的话，（不去触发insert函数，当前Vnode dom对象还没添加到dom树上）
      // 此时就把Vnode放在insertedVnodeQueue队列中，在patch函数最后会遍历这个队列中的所有的Vnode，依次执行insert函数
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 设置CSS的作用域id属性。
  // 这是一个特殊的情况，以避免开销
  // 通过正常的属性补丁过程。
  function setScope(vnode) {
    let i
    if (isDef((i = vnode.fnScopeId))) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  // 遍历所有新节点的子节点，然后调用createElm把子节点转换成真实的dom，挂载到dom树
  function addVnodes(
    parentElm,
    refElm,
    vnodes,
    startIdx,
    endIdx,
    insertedVnodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(
        vnodes[startIdx],
        insertedVnodeQueue,
        parentElm,
        refElm,
        false,
        vnodes,
        startIdx
      )
    }
  }

  function invokeDestroyHook(vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode)
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    if (isDef((i = vnode.children))) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  function removeVnodes(vnodes, startIdx, endIdx) {
    // 遍历节点中所有的Vnode,
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      // 查找是否存在
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          // 如果这个节点存在，并且有tag标签，从dom上移除，并触发对应的Remove钩子函数，再去触发destory钩子函数
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else {
          // Text node
          // 不存在tag的话，证明是一个文本节点，把文本节点从dom树上移除掉
          removeNode(ch.elm)
        }
      }
    }
  }

  function removeAndInvokeRemoveHook(vnode, rm?: any) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      if (
        isDef((i = vnode.componentInstance)) &&
        isDef((i = i._vnode)) &&
        isDef(i.data)
      ) {
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        i(vnode, rm)
      } else {
        rm()
      }
    } else {
      removeNode(vnode.elm)
    }
  }

  // 对比新老子节点，对比差异，更新到dom树
  // diff算法：更新新旧节点的子节点
  function updateChildren(
    parentElm,
    oldCh, // 数组形式
    newCh, // 数组形式
    insertedVnodeQueue,
    removeOnly
  ) {
    // 新老节点开始的索引
    let oldStartIdx = 0
    let newStartIdx = 0

    // 老节点结束索引 和  老节点第一个和最后一个的Vnode
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]

    // 新节点结束索引  和  新节点第一个和最后一个Vnode
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]

    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    // 检查老节点中，新节点是否有重复的key，如果有重复的key在开发环境中会警告
    if (__DEV__) {
      checkDuplicateKeys(newCh)
    }

    // 地府diff算法
    // 两个数组都没有遍历完的时候
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
        // 1. 判断老的节点的开始节点是否有值，如果没有的话，获取下一个老的节点
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        // 2. 判断老节点的最后一个是否有值，如果没有，则获取前一个节点
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 3. oldStartVnode 和 newStartVnode相同 （sameVnode）
        // 直接将该VNode节点进行patchVnode，然后更新值
        patchVnode(
          oldStartVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )
        // 获取下一组开始节点
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 直接将该VNode节点进行patchVnode
        patchVnode(
          oldEndVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )
        // 获取下一组结束节点
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        // 上面是前两种情况，如果都不满足，可能是做了反转操作，开始对比老的开始节点和新的结束节点

        // oldStartVnode 和 newEndVnode 相同 （sameVnode）
        // 进行patchVnode 把oldStartVnode移动到最后
        patchVnode(
          oldStartVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )
        canMove &&
          nodeOps.insertBefore(
            parentElm,
            oldStartVnode.elm,
            nodeOps.nextSibling(oldEndVnode.elm)
          )
        // 移动游标，获取下一组节点
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left
        // oldEndVnode和newStartVnode相同(sameVnode)
        // 进行patchVnode,把oldEndVnode移动到最前面
        patchVnode(
          oldEndVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )
        canMove &&
          nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 以上四种情况都不满足
        // newStartNode依次和旧的节点比较

        // 从新的节点开头获取一个,去老节点中查找相同节（体现了使用key更快一点）
        // 先找新开始节点的key和老节点相同的索引，如果没找到再通过sameVnode找
        if (isUndef(oldKeyToIdx))
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)

        // 如果没有找到
        if (isUndef(idxInOld)) {
          // 创建节点并插入到最前面
          createElm(
            newStartVnode,
            insertedVnodeQueue,
            parentElm,
            oldStartVnode.elm,
            false,
            newCh,
            newStartIdx
          )
        } else {
          // 获取要移动的老节点
          vnodeToMove = oldCh[idxInOld]
          // 如果使用newStartNode找到相同的老节点
          if (sameVnode(vnodeToMove, newStartVnode)) {
            // 执行patchVnode，并且将找到的旧节点移动到最前面
            patchVnode(
              vnodeToMove,
              newStartVnode,
              insertedVnodeQueue,
              newCh,
              newStartIdx
            )
            oldCh[idxInOld] = undefined
            canMove &&
              nodeOps.insertBefore(
                parentElm,
                vnodeToMove.elm,
                oldStartVnode.elm
              )
          } else {
            // 如果key相同，但是是不同的元素，创建新元素
            // same key but different element. treat as new element
            createElm(
              newStartVnode,
              insertedVnodeQueue,
              parentElm,
              oldStartVnode.elm,
              false,
              newCh,
              newStartIdx
            )
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 当结束时，oldStartVnode > oldEndIdx，旧节点遍历完，但是新节点还没有
    if (oldStartIdx > oldEndIdx) {
      // 说明新节点比老节点多，把剩下的新节点插入到老的节点后面
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(
        parentElm,
        refElm,
        newCh,
        newStartIdx,
        newEndIdx,
        insertedVnodeQueue
      )
    } else if (newStartIdx > newEndIdx) {
      // 当结束时，newStartIdx > newEndIdx新节点遍历完,但是旧节点还没有，然后批量删除
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  // 判断children中是否有相同的key，如果有相同的key会警告，如果没有会记录当前的key
  function checkDuplicateKeys(children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  // 对比新旧节点的差异
  function patchVnode(
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly?: any
  ) {
    if (oldVnode === vnode) {
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = (vnode.elm = oldVnode.elm)

    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    if (
      isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    // 获取Vnode中的data，再获取data中的hook，再去找hook中的prepatch钩子函数，如果存在的话，执行这个钩子函数
    let i
    const data = vnode.data
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode)
    }

    // 先获取新旧节点的子节点，稍后会用到
    const oldCh = oldVnode.children
    const ch = vnode.children
    // 先判断data是否有值
    if (isDef(data) && isPatchable(vnode)) {
      // 调用cbs中的钩子函数，操作节点的属性/样式/事件....
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // 用户的自定义钩子
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode)
    }

    // 新节点没有text属性
    if (isUndef(vnode.text)) {
      // 新老节点的子节点都有值，并且新老节点不一样，然后更新真实的DOM
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        // 新节点子节点有值
        if (__DEV__) {
          // 开发环境下 检查老节点中，新节点的key是否有重复，如果有重复，警告
          checkDuplicateKeys(ch)
        }
        // 判断oldVnode中是否有text属性，如果有，先清空老节点DOM的文本内容，然后为当前DOM节点加入子节点
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        // 遍历所有新节点的子节点，然后调用createElm把子节点转换成真实的dom，挂载到dom树
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 老节点有子节点，新的没有子节点
        // 删除老节点中的子节点
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 老节点有文本，新节点没有文本
        // 清空老节点的文本内容
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 新老节点都有文本节点,修改文本
      nodeOps.setTextContent(elm, vnode.text)
    }
    // 当所有操作完成之后，会获取data中的hook，获取postpatch钩子函数，并执行（patch过程执行完毕）
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.postpatch))) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook(vnode, queue, initial) {
    // isInitialPatch   initial记录当前Vnode在dom树上

    // 当initial为true，且Vnode.parent的属性存在
    if (isTrue(initial) && isDef(vnode.parent)) {
      // 延缓插入的操作
      // 标记当前的插入的一个pending，并将队列赋值给pendingInsert
      vnode.parent.data.pendingInsert = queue
    } else {
      // 否则的话，遍历队列中，触发对应的insert函数
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre?: boolean) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (__DEV__) {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init)))
        i(vnode, true /* hydrating */)
      if (isDef((i = vnode.componentInstance))) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (
            isDef((i = data)) &&
            isDef((i = i.domProps)) &&
            isDef((i = i.innerHTML))
          ) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (
                !childNode ||
                !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)
              ) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn(
                  'Mismatching childNodes vs. VNodes: ',
                  elm.childNodes,
                  children
                )
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf('vue-component') === 0 ||
        (!isUnknownElement(vnode, inVPre) &&
          vnode.tag.toLowerCase() ===
            (node.tagName && node.tagName.toLowerCase()))
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }
  // 函数柯里化，让一个函数返回一个函数
  // createPatchFunction({ nodeOps,modules }) 传入平台相关的两个参数

  // core中的createPatchFunction(backend),const { modules,nodeOps } = backend
  // core中方法和平台无关，传入两个参数后，可以在上面的函数中使用这两个参数
  // oldVNode  vnode 新的Vnode
  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    // 新的Vnode不存在
    if (isUndef(vnode)) {
      // 老的Vnode存在,执行Destory钩子函数
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    // 新插入的Vnode节点的队列，队列里面存储新插入的Vnode节点
    // 存储节点的目的是为了把节点对应的dom元素，挂载到dom树上后，会去触发这个Vnode的钩子函数
    const insertedVnodeQueue: any[] = []

    // 老的VNode不存在，当调用组件的$mount方法，但是没有传入参数的时候，如果$mount传入参数了，证明要把组件挂载到页面的某个位置
    // 如果没有传入参数,证明只是把组件创建出来,并不挂载到视图上来,
    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      // 使用变量记录，组件创建好了,仅仅存储在内存中,没有挂载到dom树上来
      isInitialPatch = true
      // 然后把这个只创建的Vnode创建成真实的DOM，只是存储在内存中，并没有挂载到真实的DOM上
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 新的和老的VNode都存在，
      // nodeType是DOM对象的属性，如果nodeType存在的话，说明oldVnode是一个真实的dom元素
      // 如果是真实DOM元素，说明是首次渲染的时候（首次渲染和更新是不一样的）
      const isRealElement = isDef(oldVnode.nodeType)

      // 判断参数是否真实DOM,
      // 如果 不是真实DOM，而且新旧节点是相同的节点
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 如果是相同节点的话就对比两个节点的差异，patchVnode
        // 更新操作：diff算法
        // 会去对比新老节点,并更新到真实dom上来
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 第一个参数是真实DOM,创建VNode
        // 不是真实dom，不是相同节点
        if (isRealElement) {
          // 判断跟ssr相关的东西
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (__DEV__) {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                  'server-rendered content. This is likely caused by incorrect ' +
                  'HTML markup, for example nesting block-level elements inside ' +
                  '<p>, or missing <tbody>. Bailing hydration and performing ' +
                  'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it

          // 如果oldVnode是真实节点的话，就把oldVnode转换成虚拟DOM节点（Vnode）
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        // 获取dom元素, 是为了找这个dom元素的父元素（找父元素是因为将来找到Vnode挂载到上面）
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // 把Vnode转换成真实dom，挂载到parentElm上
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)

          // 如果在执行过渡动画，且是leaving的时候，把父节点设为null，这样不会把真实的dom挂载到dom树上
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)// 获取下一个兄弟节点, 传入这个参数,会把转换的真实dom插入到这个元素之前，并且会把Vnode记录到insertedVnodeQueue中来
        )

        // 处理父节点占位符的问题
        // update parent placeholder node element, recursively
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // 移除老节点
        // 判断parentElm是否存在，parentElm是从oldVNode中获取的
        // destroy old node
        if (isDef(parentElm)) {
          // 把oldVnode从页面上移除，并触发对应的钩子函数
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          // 如果parentElm不存在，说明oldVnode  dom树上并不在，然后判断是否有tag属性，如果有执行Destroy钩子函数
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 触发insertedVnodeQueue队列中所有新插入的钩子函数inset
    // isInitialPatch表示是否挂载到dom树上
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    // 最后把新的dom元素返回，记录到Vnode.elm
    return vnode.elm
  }
}
