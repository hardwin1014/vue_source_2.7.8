/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks: Array<Function> = []
let pending = false

function flushCallbacks() {
  // 标记为false，表示处理结束了
  pending = false
  // 拷贝一份，并且把callbacks数组清空，保证能继续往里面添加
  const copies = callbacks.slice(0)
  callbacks.length = 0
  // 遍历回调函数数组，找到每一个回调函数，依次调用
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).

//这里我们有使用微任务的异步延迟包装器。
//在2.5中我们使用了(宏)任务(与微任务结合使用)。
//然而，它有一个微妙的问题，当状态改变时，就在重新油漆
//(例如#6813,out-in转换)。
//另外，在事件处理程序中使用(宏)任务会导致一些奇怪的行为
//不能被绕过(例如#7109，#7153，#7546，#7834，#8109)。
//所以我们现在又在任何地方使用微任务了。
//这种折衷的一个主要缺点是在某些情况下
//当微任务的优先级过高时，应该会在两者之间触发
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */

// nextTick行为利用可访问的微任务队列
// 通过native Promise.then或MutationObserver
// MutationObserver有更广泛的支持，但是它有严重的bug
// UIWebView在iOS >= 9.3.3时触发的触摸事件处理程序。它触发几次后完全停止工作…所以,如果本地Promise是可用的，我们将使用它:
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    // 通过promise调用的，flushCallbacks刷新回调函数的数组
    // 优先使用微任务的方式处理，执行时机（本次循环执行完之后，所有的同步任务执行完之后，才会执行微任务）
    // （如果使用微任务，nextTick从dom树上获取dom，此时的dom还没有渲染到浏览器上来）
    p.then(flushCallbacks)

    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.

    // 在有问题的UIWebViews（iOS开发时使用到的控件）中，，Promise.then 不会完全跳出但是它可能会陷入一个奇怪的状态，
    // 回调被推入微任务队列，但队列不会被刷新，直到浏览器需要做一些其他的工作，例如处理计时处理
    // 因此,我们可以通过添加一个空定时器来"强制"微任务队列被刷新。
    if (isIOS) setTimeout(noop)
  }
  // 并且标志当前的任务队列使用的是微任务
  isUsingMicroTask = true
} else if (
  // MutationObserver监听dom对象的改变，dom改变之后会执行一个回调函数。这个回调函数也是以微任务的形式执行的
  // 判断不是ie浏览器（MutationObserver在IE10，IE11中才支持（IE11中有些小问题）），并且当前浏览器支持MutationObserver，
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  // （为了兼容这些浏览器，这些浏览器中会使用MutationObserver（微任务）执行）
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  // 如果使用MutationObserver，也会标记成使用微任务
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 如果既不支持promise也不支持MutationObserver，就使用setImmediate（只有ie和node中支持）

  // setImmediate回调（性能比setTimeout好）
  // 从技术上讲，它利用了(宏)任务队列，
  // 但它仍然是一个比setTimeout更好的选择。
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  // 即使设为0，在执行的时候至少也得等4毫秒的时间
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick(): Promise<void>
export function nextTick<T>(this: T, cb: (this: T, ...args: any[]) => any): void
export function nextTick<T>(cb: (this: T, ...args: any[]) => any, ctx: T): void

export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  let _resolve

  // callbacks就是一个数组，把cb加上异常处理存入callbacks数组中
  callbacks.push(() => {
    // cb 是用户传递的函数，Vue认为用户传递的函数都是危险的，所以加上try catch
    if (cb) {
      try {
        // 调用cb()
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 判断队列正在被处理，如果没有被处理，就标志为true，表示正在被处理
  if (!pending) {
    pending = true
    // 遍历callbacks数组，找到数组中的函数，依次执行
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    // 返回 promise 对象
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
