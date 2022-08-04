import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'
import type { Component } from 'types/component'

// install platform specific utils（平台相关的方法，内部使用）
// 判断是否是html中特有的关键属性(表单元素的input、checked、selected、muted)
// 如果是这些属性，设置el.props属性(属性不设置到标签上)
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// install platform runtime directives & components
// 1. 注册了全局相关的指令和组件，extend方法将属性混合到目标对象中
// 注册了 Transition TransitionGroup  v-model  v-show
// Vue.options.directives 这些指令是web平台特有的，全局的
// Vue.options.components 这些组件是web平台特有的，全局的
extend(Vue.options.directives, platformDirectives)
extend(Vue.options.components, platformComponents)

// install platform patch function
// 2. 注册__patch__方法
// __patch__函数是把虚拟DOM转换成真实DOM,如果是浏览器环境就返回真实dom,如果不是，就返回空函数
// inBrowser 判断是否是浏览器环境
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method
// 3. 注册$mount方法
// 给Vue原型上增加了一个$mount方法，作用:渲染DOM
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 返回dom对象，并渲染
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}

// devtools global hook  跟调试相关代码
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (__DEV__ && process.env.NODE_ENV !== 'test') {
        // @ts-expect-error
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
            'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (
      __DEV__ &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      // @ts-expect-error
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
          `Make sure to turn on production mode when deploying for production.\n` +
          `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

// 导出Vue
export default Vue
