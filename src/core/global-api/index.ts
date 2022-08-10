import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'
import type { GlobalAPI } from 'types/global-api'

export function initGlobalAPI(Vue: GlobalAPI) {
  // config 对象，有get方法
  const configDef: Record<string, any> = {}
  configDef.get = () => config
  // 判断环境，如果是开发环境，会触发一个set方法，会抛出警告，不要去替换config，可以在config中挂载一些方法
  if (__DEV__) {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  // 初始化Vue.config对象，定义了vue的静态成员
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 这些工具方法不视做全局API的一部分，除非你已经意识到某些风险，否则不要去依赖他们
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 静态方法，set delete  nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // 让一个对象变成可响应式的
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // 初始化Vue.options对象，存储全局的components/directives/filters
  // export const ASSET_TYPES = ['component', 'directive', 'filter'] as const
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // 这用于标识扩展所有普通对象的“基”构造函数  initAssetRegisters方法中有使用
  // 在Weex的多实例场景中。
  Vue.options._base = Vue

  // 注册全局组件
  extend(Vue.options.components, builtInComponents)

  // 注册了Vue.use() 用来注册插件
  initUse(Vue)
  // 注册Vue.mixin() 来实现混入
  initMixin(Vue)
  // 注册Vue.extend() 基于传入的options返回一个组件的构造函数
  initExtend(Vue)
  // 注册 Vue.directive()、 Vue.component()、Vue.filter()
  initAssetRegisters(Vue)
}
