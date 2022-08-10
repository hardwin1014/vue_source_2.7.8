import { ASSET_TYPES } from 'shared/constants'
import type { Component } from 'types/component'
import type { GlobalAPI } from 'types/global-api'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'
import { getComponentName } from '../vdom/create-component'

export function initExtend(Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   * 每个实例构造函数(包括Vue)都有一个惟一的cid。这使我们能够为原型继承创建封装的“子构造函数”并缓存它们
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   * 返回的vue组件的构造函数
   */
  Vue.extend = function (extendOptions: any): typeof Component {
    extendOptions = extendOptions || {}
    // Vue 构造函数
    const Super = this
    const SuperId = Super.cid
    // 从缓存中加载组件的构造函数
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name =
      getComponentName(extendOptions) || getComponentName(Super.options)
    if (__DEV__ && name) {
      // 如果不是开发环境验证组件的名称
      validateComponentName(name)
    }

    const Sub = function VueComponent(this: any, options: any) {
      this._init(options)
    } as unknown as typeof Component

    // 继承自Vue，上面将this赋值给了Super
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 合并options
    Sub.options = mergeOptions(Super.options, extendOptions)
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 如果组件中有props，那就初始化props
    if (Sub.options.props) {
      // 调用_init()初始化
      initProps(Sub)
    }
    // 如果组件中有computed，那就初始化computed
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 将super（Vue）中的成员拷贝到sub中
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    cachedCtors[SuperId] = Sub
    // 最终把构造函数返回，返回的是Vue.components
    return Sub
  }
}

function initProps(Comp: typeof Component) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed(Comp: typeof Component) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
