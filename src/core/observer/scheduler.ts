import type Watcher from './watcher'
import config from '../config'
import Dep from './dep'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index'
import type { Component } from 'types/component'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: true | undefined | null } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 * 更新完视图之后，重置调度程序的状态。
 */
function resetSchedulerState() {
  // 会把队列的长度的活跃的子对象设置为0
  index = queue.length = activatedChildren.length = 0
  // has处理成空对象，不再记录watcher是否被处理过了
  has = {}
  if (__DEV__) {
    circular = {}
  }
  // 将状态设置为false，重置状态
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

const sortCompareFn = (a: Watcher, b: Watcher): number => {
  if (a.post) {
    if (!b.post) return 1
  } else if (b.post) {
    return -1
  }
  return a.id - b.id
}

/**
 * Flush both queues and run the watchers.
 * 刷新两个队列并运行观察器。
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow()
  flushing = true // 标记当前正在刷新watcher队列
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.

  /**
   * 先排序，按照id的从小到大的顺序，也就是按照watcher的创建顺序排列的
   * 1. 组件被更新的顺序是从父组件到子组件（因为先创建父组件，后创建子组件）
   * 2. 组件的用户watcher要在他对应的渲染之前执行（因为用户watcher是在渲染之前创建的）
   *    initState（里面创建的用户watcher，计算属性对应的watcher）是在mountComponent（里面创建了渲染watcher）之前执行的
   * 3. 如果一个组件在父组件执行之前被销毁了，这个watcher被跳过
   * */

  // 对队列进行排序，为了保证以上三点
  queue.sort(sortCompareFn)

  // 不要缓存length，因为可能在queue在遍历当中，我们还有可能会推送更多的watcher

  // 核心是找到每一个watcher，调用run方法
  // 遍历队列，找到每一个watcher对象，执行run方法
  for (index = 0; index < queue.length; index++) {

    // 取出当前要处理的watcher，并判断是否有before这个函数
    // 也就是在watcher更新视图之前，先触发了beforeUpdate函数
    watcher = queue[index]
    if (watcher.before) {
      watcher.before() // before这个函数，创建渲染watcher的时候才会有的，传入的是beforeUpdate
    }

    // 找到watcher的id，设置为null，因为此时的watcher已经被处理过了，设置为null是为了下一次数据还能正常处理 在queueWatcher方法中
    id = watcher.id
    has[id] = null
    watcher.run() // 执行核心方法，在run方法里面会更新视图

    // in dev build, check and stop circular updates.
    if (__DEV__ && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 在重置状态之前，备份了两个队列
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置任务队列的状态
  resetSchedulerState()

  // call component updated and activated hooks
  // 触发组件更新和激活的钩子函数
  callActivatedHooks(activatedQueue) // 触发的是activated钩子函数
  callUpdatedHooks(updatedQueue)  // 触发的是updated钩子函数

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks(queue: Watcher[]) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm && vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * 把一个watcher推到watcher队列中
 * 具有重复id的作业将被跳过，除非它在队列刷新时被推送
 */
export function queueWatcher(watcher: Watcher) {
  // 获取到watcher的id
  const id = watcher.id
  // 获取has对象中的id，如果为null的话，证明已经被处理，直接return
  // 作用： 防止watcher对象重复处理
  if (has[id] != null) {
    return
  }

  if (watcher === Dep.target && watcher.noRecurse) {
    return
  }

  // 没有被处理的话，把has[id]标记为true，标记当前watcher已经被处理掉了
  has[id] = true
  // 如果正在刷新，代表queue队列正在被处理
  if (!flushing) {
    // 如果这个队列没有在处理的时候，直接放在队列的末尾来
    queue.push(watcher)
  } else {
    // 如果已经刷新，则根据其id拼接watcher
    // 如果已经超过了它的id，它将立即运行

    // 把要创建的watcher对象放入队列里面来

    // 获取队列的长度
    // 判断大于index，queue拿到对应的id是否大于watcher的id，如果大于待处理的位置的id，就把i处理一下
    let i = queue.length - 1
    while (i > index && queue[i].id > watcher.id) {
      i--
    }
    // 将待处理的watcher放到待处理的位置来
    queue.splice(i + 1, 0, watcher)
  }
  // queue the flush
  // 判断当前队列是否被执行，表示正在刷新队列
  if (!waiting) {
    // 修改状态
    waiting = true

    // 如果是开发环境，直接调用flushSchedulerQueue函数  ，并return
    if (__DEV__ && !config.async) {
      flushSchedulerQueue()
      return
    }

    // 把刷新队列的函数传入 nextTick , 如果是生产环境，放入nextTick中执行
    nextTick(flushSchedulerQueue)
  }
}
