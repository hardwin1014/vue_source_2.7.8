import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
import type { GlobalAPI } from 'types/global-api'

// Vue 构造函数接收一个options
function Vue(options) {
  // 首先判断当前环境是否是生产环境还是开发环境,__DEV__生产环境会返回false
  // 再判断当前实例是否是Vue,如果不是，说明没有使用new来调用Vue构造函数
  // 把vue当成普通函数来调用，此时会发送一个警告
  if (__DEV__ && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }

  // 调用_init方法
  this._init(options)
}
// 下面这几个函数做的事情都是  给vue的原型上混入了一些成员

//@ts-expect-error Vue has function type
// 注册vm的_init()方法，初始化vm
initMixin(Vue)

//@ts-expect-error Vue has function type
// 注册vm的$data、$props、$set、$delete、$watch、
stateMixin(Vue)

//@ts-expect-error Vue has function type
// 初始化事件相关方法
// $on、$once、$off、$emit、
eventsMixin(Vue)

//@ts-expect-error Vue has function type
// 初始化生命周期相关的混入方法
// _update、$forceUpdate、$destory
lifecycleMixin(Vue)

//@ts-expect-error Vue has function type
// 混入render
// $nextTick、 _render
renderMixin(Vue)

export default Vue as unknown as GlobalAPI
