import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'
import { initSetup } from 'v3/apiSetup'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  isArray,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
  isFunction
} from '../util/index'
import type { Component } from 'types/component'
import { shallowReactive, TrackOpTypes } from 'v3'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// proxy代理，获取和设置属性的时候，其实是获取的get和set，最终访问的时候还是通过this._props访问的
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState(vm: Component) {
  const opts = vm.$options
  // 1. 接收两个参数，vue实例和props属性，把props成员注入到vue实例中来，
  if (opts.props) initProps(vm, opts.props)

  // Composition API
  initSetup(vm)

  // 2. 初始化了methods
  if (opts.methods) initMethods(vm, opts.methods)
  // 3. 判断options是否有data选项，如果有，初始化data，会遍历data中的成员，把这些成员注入到vue的实例上
  if (opts.data) {
    // 把属性注入到实例上，判断是否和props，methods重名
    initData(vm)
  } else {
    // 如果options没有传入data选项，那么就把data初始化成空对象，转换成响应式的
    // observe将数据转成响应式对象，为值创建观察者
    const ob = observe((vm._data = {}))
    ob && ob.vmCount++
  }

  // 初始化了计算属性和监听器，并注入到了vue实例里面来
  if (opts.computed) initComputed(vm, opts.computed)

  // 先获取options中的watch，也就是vue里面的属性watch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  // 1. 将props存储到常量里面来,所有的成员都会在_props中存储
  const props = (vm._props = shallowReactive({}))
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys: string[] = (vm.$options._propKeys = [])
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }

  // 遍历props中的所有的属性,通过defineReactive转换成get和set存储到props里面（vm._props）
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (__DEV__) {
      const hyphenatedKey = hyphenate(key)
      // 如果直接赋值会发送一个警告
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 如果是生产环境的话,直接将属性转为getter和setter
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 判断属性是否在vue实例上，如果不在会使用proxy代理到vm上
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 作用：注入到vue实例和进行对数据响应式之前，进行判断data中的成员是否和props，methods重名（如果重名会在开发环境进行警告）
function initData(vm: Component) {
  // 先获取options的data选项
  let data: any = vm.$options.data
  // 初始化了vm._data,判断data选项是否是function，  getData是把data当成函数来处理(组件中的data是一个函数)，vue实例中的data是一个对象
  data = vm._data = isFunction(data) ? getData(data, vm) : data || {}
  if (!isPlainObject(data)) {
    data = {}
    __DEV__ &&
      warn(
        'data functions should return an object:\n' +
          'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
        vm
      )
  }
  // proxy data on instance
  // 获取data中的所有属性,
  const keys = Object.keys(data)
  // 获取props / methods
  const props = vm.$options.props
  const methods = vm.$options.methods

  let i = keys.length
  // 判断data上的成员是否和props、 methods重名，因为最终都要注入到props中来
  while (i--) {
    const key = keys[i]
    if (__DEV__) {
      if (methods && hasOwn(methods, key)) {
        warn(`Method "${key}" has already been defined as a data property.`, vm)
      }
    }
    if (props && hasOwn(props, key)) {
      __DEV__ &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        )
    } else if (!isReserved(key)) {
      // 如果是以_或者$开头，不会将属性注入到实例中来

      // 如果不是以$_开头，会使用proxy把这个属性注入到实例中来，同时传入一个_data
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 最后做一个响应式的处理，响应式处理的入口
  const ob = observe(data)
  // 以这个对象作为根$data的vm的数量，进行累加
  ob && ob.vmCount++
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 此时的data是一个函数，vue组件中的data是一个函数
    return data.call(vm, vm)
  } catch (e: any) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

// 常量
const computedWatcherOptions = { lazy: true }
// 计算属性watcher，传入lazy默认为true
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null))
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = isFunction(userDef) ? userDef : userDef.get
    if (__DEV__ && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm)
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (__DEV__) {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        )
      }
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Record<string, any> | (() => any)
) {
  const shouldCache = !isServerRendering()
  if (isFunction(userDef)) {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (__DEV__ && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        if (__DEV__ && Dep.target.onTrack) {
          Dep.target.onTrack({
            effect: Dep.target,
            target: this,
            type: TrackOpTypes.GET,
            key
          })
        }
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

// 把选项中的methods注入到vue实例，注入之前会判断和props中有重名的属性，判断了一下命名的规范，是否以$和_开头
function initMethods(vm: Component, methods: Object) {
  // 1.先获取props实例
  const props = vm.$options.props
  for (const key in methods) {
    // 开发环境中
    if (__DEV__) {
      // 判断method是否是function，如果不是function，会发送警告
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        )
      }
      // 如果在props对象中存在，会发送一个警告，警告method的key在props中存在
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm)
      }
      // 判断key是否在vue实例中存在，并且判断是否以_或者$开头。如果以_开头，vue会认为是一个私有的属性，所有以$开头的成员，我们会以为vue的成员
      // 所以我们不建议命名时以$和_开头
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        )
      }
    }

    // 判断是否是function，如果不是function的话返回一个noop(空函数)，不然就返回，把当前这个函数的this指向改成vm
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch(vm: Component, watch: Object) {
  // 先遍历选项里面的watch对象，找到所有属性
  for (const key in watch) {
    // 获取所有值
    const handler = watch[key]
    //如果是数组，会把监听的属性，创建多个监听的属性，也就是当这个属性发生变化的时候，会执行多个回调函数
    if (isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        // 传递了vue实例，属性，和属性对应的值
        createWatcher(vm, key, handler[i])
      }
    } else {
      // 传递了vue实例，属性，和函数
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | (() => any),
  handler: any,
  options?: Object
) {
  // 如果handle是一个对象,会把对象的handler的handler取出来
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler // 回调函数
  }
  // 如果传入的handler是字符串，会去vue实例中找这个字符串对应的函数，也就是methods中的方法
  if (typeof handler === 'string') {
    // 把methods的方法作为回调函数
    handler = vm[handler]
  }

  // 把解析好的数据作为$watch的参数
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: typeof Component) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.

  // 属性描述符中分别设置了get方法，返回了对应的属性，this._data和this._props
  const dataDef: any = {}
  dataDef.get = function () {
    return this._data
  }
  const propsDef: any = {}
  propsDef.get = function () {
    return this._props
  }

  // 如果是开发环境，如果给$data和$props赋值，会发出警告
  if (__DEV__) {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }

  // 使用defineProperty给Vue的原型上挂载$data和$props, dataDef和propsDef分别是属性的描述符
  // 使用defineProperty是为了设置不让给data props重新赋值
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 挂载$set和$delete
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 挂载$watch  $watch是一个实例方法，没有静态方法，原因就是用到了vue的实例
  Vue.prototype.$watch = function (
    expOrFn: string | (() => any),
    cb: any,// 可以直接传函数，也可以传对象
    options?: Record<string, any>
  ): Function {
    // 先获取vue实例
    const vm: Component = this
    // 对对象重新解析
    // 判断watch传入的第二个参数，是否是原始对象
    // 如果是对象的话，在这重新对对象解析
    if (isPlainObject(cb)) {
      // 解析对象类型的参数
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 标记当前创建的watcher为用户watcher
    options.user = true
    // 创建用户watcher对象
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 判断immediate如果为true，就立即执行
    if (options.immediate) {
      // 立即执行一次cb回调，并且把值传入
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      // 里面也是立即执行cb函数
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }

    // 返回取消监听的方法
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
