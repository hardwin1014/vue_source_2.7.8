import attrs from './attrs'
import klass from './class'
import events from './events'
import domProps from './dom-props'
import style from './style'
import transition from './transition'

// 操作 属性、样式、事件，  跟snabbdom不一样的是，多了transition属性，处理过渡动画
// 导出的生命周期函数
export default [attrs, klass, events, domProps, style, transition]
