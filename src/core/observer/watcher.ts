import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
  isFunction
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget, DepTarget } from './dep'
import { DebuggerEvent, DebuggerOptions } from 'v3/debug'

import type { SimpleSet } from '../util/index'
import type { Component } from 'types/component'
import { activeEffectScope, recordEffectScope } from 'v3/reactivity/effectScope'

let uid = 0

export interface WatcherOptions extends DebuggerOptions {
  deep?: boolean
  user?: boolean
  lazy?: boolean
  sync?: boolean
  before?: Function
}

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 *
 */
export default class Watcher implements DepTarget {
  vm?: Component | null
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before?: Function
  onStop?: Function
  noRecurse?: boolean
  getter: Function
  value: any
  post: boolean

  // dev only
  onTrack?: ((event: DebuggerEvent) => void) | undefined
  onTrigger?: ((event: DebuggerEvent) => void) | undefined

  constructor(
    vm: Component | null,
    expOrFn: string | (() => any), // updateComponent
    cb: Function,
    options?: WatcherOptions | null,
    isRenderWatcher?: boolean
  ) {
    recordEffectScope(this, activeEffectScope || (vm ? vm._scope : undefined))
    // 先记录vue实例到vm中，在判断是否是首次渲染
    if ((this.vm = vm)) {
       // 然后判断是否是 渲染watcher
      if (isRenderWatcher) {
        // 如果是把当前vue实例记录到vue实例的_watcher上
        vm._watcher = this
      }
    }
    // options  非渲染watcher可能会传进来一些渲染选项
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
      if (__DEV__) {
        this.onTrack = options.onTrack
        this.onTrigger = options.onTrigger
      }
    } else {
      // 如果没有传入options选项的话，他们默认的值都是false
      this.deep = this.user = this.lazy = this.sync = false
    }
    // 记录了很多属性
    this.cb = cb // noop(渲染watcher传入的是空函数)，用户渲染和计算属性渲染会传入函数
    this.id = ++uid // uid for batching  唯一标识watcher，用来自增
    this.active = true // 标识当前watcher是否是存活的watcher，默认为true
    this.post = false
    this.dirty = this.lazy // for lazy watchers 延迟执行（计算属性）
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = __DEV__ ? expOrFn.toString() : ''

    // getter的解析表达式
    // getter 会存储传过来的参数，如果是函数，赋值给getter
    if (isFunction(expOrFn)) {
      this.getter = expOrFn
    } else {
      // expOrFn是字符串的时候，例如'watch: { 'person.name': function... }'
      // parsePath('person.name') 返回一个函数获取person.name的值
      // getter 是一个函数，作用：返回属性的结果，触发了属性的getter，回去收集依赖
      this.getter = parsePath(expOrFn)
      // 如果getter不存在，或者是开发环境的话，会触发一个警告
      if (!this.getter) {
        this.getter = noop
        __DEV__ &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    // 会判断lazy，如果是渲染watcher，lazy默认为false，会返回get方法
    // 计算属性的时候，先不对get求值，计算属性这个方法放在模板属性中调用的，所以是在render
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 求值getter，并重新收集依赖项。
   *
   * 如果是渲染watcher的话，会调用getter，此时getter存储的是updateComponent,去更新视图
   */
  get() {
    // 把当前的watcher入栈，为什么要入栈里面呢？
    // 因为有父子组件嵌套的时候，把父组件的watcher入栈，再去处理子组件的watcher，然后再把父组件的watcher出栈
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 如果是渲染函数的话，getter里面存储的是updateComponent，因为在创建watcher的时候传入的是updateComponent
      // 这里会调用lifecycle文件中的mountComponent方法，中的updateComponent方法
      // 执行updateComponent,执行完之后把虚拟dom生成真实dom渲染到页面上来
      value = this.getter.call(vm, vm)
    } catch (e: any) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // 深度监听属性
      // 当我们监听一个对象的话，会监听对象下的子属性
      // 如果对象下的属性还有值的话，会继续触发watcher
      if (this.deep) {
        traverse(value)
      }

      // 执行完之后，会做一些清理的工作，把target从栈中清空
      popTarget()
      // 清理依赖项收集，把watcher从subs数组中移除,并且把watcher中记录的dep也清除
      this.cleanupDeps()
    }
    // undefined ,因为updateComponent什么也没有返回
    return value
  }

  /**
   * Add a dependency to this directive.
   * 给这个指令添加一个依赖项。
   */
  addDep(dep: Dep) {
    const id = dep.id
    // 先判断一下当前是否已经存储了dep对象，是否有值
    if (!this.newDepIds.has(id)) {
      // 如果没有的话，把当前的id和dep存储到集合中
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 最后会把watcher对象，添加到dep的sub中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp: any = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * 用户界面更新。
   * 将在依赖项更改时调用
   *
   * 渲染watcher中的lazy和sync都为false
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * run方法会更新视图
   * 在Scheduler.ts中调用
   */
  run() {
    // 判断标记这个watcher是否是存活的状态，默认是true
    if (this.active) {
      // 调用get方法，pushTarget,get中调用了getter会更新视图
      const value = this.get()
      // 如果是用户watcher，会继续往后执行
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // 获取旧值
        const oldValue = this.value
        // 记录新值
        this.value = value

        // 此时的user在，挂载$watcher 创建用户watcher的时候初始化为true
        // 如果是用户watcher，要调用cb回调函数（和渲染watcher无关，渲染watcher的cb传入的是noop）
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          // 用户watcher，下面处理的方法，里面会加上try catch，考虑事情非常全面
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          )
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 从所有依赖项的订阅者列表中删除。
   *
   */
  teardown() {
    if (this.vm && !this.vm._isBeingDestroyed) {
      remove(this.vm._scope.effects, this)
    }
    if (this.active) {
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
      if (this.onStop) {
        this.onStop()
      }
    }
  }
}
