import { remove } from '../util/index'
import config from '../config'
import { DebuggerOptions, DebuggerEventExtraInfo } from 'v3'

let uid = 0

/**
 * update方法在watcher类中
 */
export interface DepTarget extends DebuggerOptions {
  id: number
  addDep(dep: Dep): void
  update(): void
}

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * dep是一个可观察对象，可以有多个指令订阅它。
 */
export default class Dep {
  // 静态属性，watcher 对象
  static target?: DepTarget | null
  // dep实例 ID
  id: number
  // dep实例对应的watcher 对象 / 订阅者数组
  subs: Array<DepTarget>

  constructor() {
    this.id = uid++
    this.subs = []
  }

  // 向订阅者数组中添加新的订阅者watcher对象
  addSub(sub: DepTarget) {
    this.subs.push(sub)
  }

  // 移除订阅者
  removeSub(sub: DepTarget) {
    remove(this.subs, sub)
  }

  // 将观察者对象和watcher建立依赖
  depend(info?: DebuggerEventExtraInfo) {
    if (Dep.target) {
      // 如果target存在，把dep对象添加到watcher的依赖中
      Dep.target.addDep(this)
      if (__DEV__ && info && Dep.target.onTrack) {
        Dep.target.onTrack({
          effect: Dep.target,
          ...info
        })
      }
    }
  }

  // 发布通知，最终调用每个watcher的update方法
  notify(info?: DebuggerEventExtraInfo) {
    // 调用slice对数组进行克隆，先把subs数组克隆一份，这样操作的意思是：后面有可能给this.subs新增加watcher对象，此时增加的是不做处理的
    const subs = this.subs.slice()
    if (__DEV__ && !config.async) {
      // 如果不运行async, sub不会在调度程序中排序
      // 我们现在需要对它们进行分类，以确保它们正确的顺序
      subs.sort((a, b) => a.id - b.id)
    }

    // 遍历subs数组，找到update方法，执行update
    for (let i = 0, l = subs.length; i < l; i++) {
      if (__DEV__ && info) {
        const sub = subs[i]
        sub.onTrigger &&
          sub.onTrigger({
            effect: subs[i],
            ...info
          })
      }
      // 循环数组，找到update方法进行更新
      // 当前为渲染watcher，lazy和sync默认为false
      subs[i].update()
    }
  }
}

// Dep.target用来存放传进来的watcher对象
// 全局唯一，并且一次也只能有一个watcher被使用

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack: Array<DepTarget | null | undefined> = []

// 入栈并将当前watcher赋值给Dep.target
export function pushTarget(target?: DepTarget | null) {
  // 存储之前先存入到栈里面，每一个组件都对应一个watcher对象
  // 如果有嵌套，a组件中有b组件，渲染b组件，那么a组件的watcher被放入栈中，渲染完毕之后，会把他从对应的栈中弹出，继续执行父组件的渲染
  targetStack.push(target)
  Dep.target = target
}

export function popTarget() {
  // 出栈操作
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
