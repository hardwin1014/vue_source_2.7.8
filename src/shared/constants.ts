// 设置服务端渲染的，如果标签上有这个属性，证明是服务端渲染出来的
export const SSR_ATTR = 'data-server-rendered'

//  定义组件+指令+过滤器
export const ASSET_TYPES = ['component', 'directive', 'filter'] as const

// 生命周期的所有名称
export const LIFECYCLE_HOOKS = [
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeDestroy',
  'destroyed',
  'activated',
  'deactivated',
  'errorCaptured',
  'serverPrefetch',
  'renderTracked',
  'renderTriggered'
] as const
