import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  isArray,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
  hasChanged,
  noop
} from '../util/index'
import { isReadonly, isRef, TrackOpTypes, TriggerOpTypes } from '../../v3'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

const NO_INIITIAL_VALUE = {}

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

// ssr mock dep
const mockDep = {
  notify: noop,
  depend: noop,
  addSub: noop,
  removeSub: noop
} as Dep

/**
 * 附加到每个被观察对象的Observer类。一旦附加，观察者就会将目标对象的属性键转换为getter/setter来收集依赖关系和分派更新。
 */
export class Observer {
  dep: Dep  // 为属性的子对象收集依赖
  vmCount: number // 以这个对象作为根$data的vm的数量

  // value是观测对象，dep是依赖对象，vmCount实例计数器
  constructor(public value: any, public shallow = false, public mock = false) {
    // this.value = value
    this.dep = mock ? mockDep : new Dep()
    // 1. 初始化实例vmCount为0
    this.vmCount = 0
    // 2. 使用def函数，给实例挂载到观察者对象的__ob__属性，在入口中判断__ob__就是在这设置的
    // def就是对Object.defineProperty进行一个封装
    def(value, '__ob__', this)
    // 3. 数组的响应式处理，先判断是否是数组
    if (isArray(value)) {
      if (!mock) {
        // 3.1 判断当前浏览器是否支持对象原型这个属性（处理兼容性问题）
        if (hasProto) {
          // 改变数组对象的原型属性，使其指向arrayMethods,这个对象中修补了push pop 等方法，但是他的原型指向的是数组构造函数的原型
          /* eslint-disable no-proto */
          ;(value as any).__proto__ = arrayMethods
          /* eslint-enable no-proto */
        } else {
          for (let i = 0, l = arrayKeys.length; i < l; i++) {
            const key = arrayKeys[i]
            // 将修补过后的方法，重新设置到数组对象的原型上
            def(value, key, arrayMethods[key])
          }
        }
      }
      if (!shallow) {
        // 4. 为数组中的每一个对象创建响应式对象
        this.observeArray(value)
      }
    } else {
      /** 如果不是数组进行以下操作
       *
       * 遍历所有属性并将它们转换为getter/setter。只有当值类型为Object时才应该调用此方法。
       */
      const keys = Object.keys(value)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        defineReactive(value, key, NO_INIITIAL_VALUE, undefined, shallow, mock)
      }
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 循环数组中每一个元素，如果是对象的话，为其创建响应式
  observeArray(value: any[]) {
    for (let i = 0, l = value.length; i < l; i++) {
      observe(value[i], false, this.mock)
    }
  }
}

// helpers

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 尝试为一个值创建观察者，如果已有观察者，则返回原来的观察者，如果没有，则返回新创建的观察者
 */
export function observe(
  value: any,
  shallow?: boolean,
  ssrMockReactivity?: boolean
): Observer | void {
  // 先判断value是否是一个对象，或者判断value是否是虚拟dom的实例。
  // 如果他不是对象，不是ref，不是Vnode的话，就直接返回，当前value不需要进行响应式的处理
  if (!isObject(value) || isRef(value) || value instanceof VNode) {
    return
  }
  // ob是observer的一个实例
  let ob: Observer | void
  // 如果value 是否有__ob__(observer对象)属性;
  // 接下来判断value.__ob__是否是Observer的一个实例
  // 如果有的话，直接赋值给ob，下面会直接返回，相当于加了一个缓存，如果之前做过，那么就直接选择做过的
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // 下面是ob里面没有__ob__这个属性
    shouldObserve &&
    (ssrMockReactivity || !isServerRendering()) &&
    // 判断value是否是一个数组,或者是否是一个存粹的JavaScript对象
    (isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value.__v_skip /* ReactiveFlags.SKIP */ // 判断value是否是vue的实例，__v_skip是在vue实例中定义来判断
  ) {
    // 创建一个Observer对象
    ob = new Observer(value, shallow, ssrMockReactivity)
  }
  return ob
}

/**
 * 在对象上定义反应性属性。getter和setter
 */
export function defineReactive(
  obj: object, // 目标对象
  key: string, // 转换的属性
  val?: any, // 值
  customSetter?: Function | null, // 用户自定义的setter函数
  shallow?: boolean,// 浅，如果为true的话，只监听第一层属性，如果为false，那么就要深度监听
  mock?: boolean
) {
  // 负责为当前属性收集依赖，创建依赖对象实例
  // 为每一个对象创建一个收集依赖对象实例
  const dep = new Dep()
  /**
   * object.getownpropertydescriptor()方法返回一个对象，
   * 该对象描述给定对象上特定属性的配置(也就是说，直接出现在对象上而不是对象的原型链中)。
   * 返回的对象是可变的，但是改变它不会对原始属性的配置产生影响。
   *
   * 参数：
   * 第三个参数 可以定义setter和getter
   * configurable 指示当前是否可配置的
   * */
  // 获取obj的属性描述符对象
  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果没有获取到，或者指示当前是否可配置的属性为false，直接返回
  if (property && property.configurable === false) {
    return
  }

  // 获取property中的get和set，因为传入的时候有可能用户已经设置了set和get，所以先把用户设置的先取出来
  // 后面重写setter和getter，增加上依赖升级和派发更新功能
  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // 特殊情况判断, 如果我们传入的getter，或者没有setter
  // arguments是在defineReactive传递的参数, 是对参数的判断如果传入的参数是2个，那就使用obj[key]来获取
  if (
    (!getter || setter) &&
    (val === NO_INIITIAL_VALUE || arguments.length === 2)
  ) {
    // 把对象中的转换为getter和setter
    val = obj[key]
  }

  // 判断shallow（是否浅层监听）如果不是浅层监听，则执行以下步骤
  // 判断是否递归观察子对象, 并将子对象属性转换成getter/setter,返回子观察对象
  // 把值传入observer，在observer中会判断这个值是否是对象。如果是对象的话，会创建observer对象，并赋值给childOb
  let childOb = !shallow && observe(val, false, mock)

  // 把属性转换成getter和setter，也可以设置成可枚举可配置的
  Object.defineProperty(obj, key, {
    enumerable: true, // 可枚举
    configurable: true, // 可设置
    get: function reactiveGetter() {
      // 如果用户设置了预定义的getter存在，则value等于getter调用的返回值
      // 否则直接赋予属性值
      const value = getter ? getter.call(obj) : val

      // 依赖收集 下面分为开发环境和生产环境
      // 1. 如果存在当前依赖目标target，即watcher对象，则建立依赖
      if (Dep.target) {
        if (__DEV__) {
          dep.depend({
            target: obj,
            type: TrackOpTypes.GET,
            key
          })
        } else {
          // 首先会把当前dep对象添加到watcher的依赖中，最后把watcher对象添加到subs数组中
          dep.depend()
        }
        // 1.1 首先判断了子对象的观察者对象，如果子观察目标存在，建立子对象的依赖关系
        if (childOb) {
          // 每一个observer对象都有dep属性，再调用depend方法，让子对象收集依赖
          // observer 中的dep为当前对象的子对象收集依赖
          // 给子对象添加依赖
          childOb.dep.depend()

          // 1.1. 如果属性是数组，则特殊处理收集数组对象依赖
          if (isArray(value)) {
            // 将watcher对象，添加到depend数组中
            // 修改数组属性的时候，并没有发送通知
            dependArray(value)
          }
        }
      }
      // 返回属性值
      return isRef(value) && !shallow ? value.value : value
    },
    set: function reactiveSetter(newVal) {
      // 先获取旧值，如果用户设置了getter，那就调用getter的返回返回值
      const value = getter ? getter.call(obj) : val
      // hasChanged方法 判断新值是否等于旧值,里面进行了判断,尤其是对NaN,如果都为NaN的话会返回false，此时取反，进入return
      if (!hasChanged(value, newVal)) {
        return
      }
      if (__DEV__ && customSetter) {
        customSetter()
      }

      // 如果自定义的setter存在则调用，否则直接更新值
      if (setter) {
        setter.call(obj, newVal)
      } else if (getter) {
        // 如果没有setter直接返回
        // #7981: for accessor properties without setter
        return
      } else if (!shallow && isRef(value) && !isRef(newVal)) {
        // 如果不是浅层监听，老值是ref，新值不是ref，则直接赋值
        value.value = newVal
        return
      } else {
        val = newVal
      }

      // 如果新值是对象，不是浅层监听，则执行以下步骤
      // 判断是否递归观察子对象, 并将子对象属性转换成getter/setter,返回子观察对象
      childOb = !shallow && observe(newVal, false, mock)
      // 派发更新（发布更改通知）
      if (__DEV__) {
        dep.notify({
          type: TriggerOpTypes.SET,
          target: obj,
          key,
          newValue: newVal,
          oldValue: value
        })
      } else {
        dep.notify()
      }
    }
  })

  return dep
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set<T>(array: T[], key: number, value: T): T
export function set<T>(object: object, key: string | number, value: T): T
export function set(
  target: any[] | Record<string, any>,
  key: any,
  val: any
): any {
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  if (isReadonly(target)) {
    __DEV__ && warn(`Set operation on key "${key}" failed: target is readonly.`)
    return
  }
  const ob = (target as any).__ob__
  if (isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    // when mocking for SSR, array methods are not hijacked
    if (ob && !ob.shallow && ob.mock) {
      observe(val, false, true)
    }
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.'
      )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val, undefined, ob.shallow, ob.mock)
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.ADD,
      target: target,
      key,
      newValue: val,
      oldValue: undefined
    })
  } else {
    ob.dep.notify()
  }
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del<T>(array: T[], key: number): void
export function del(object: object, key: string | number): void
export function del(target: any[] | object, key: any) {
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  if (isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target as any).__ob__
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid deleting properties on a Vue instance or its root $data ' +
          '- just set it to null.'
      )
    return
  }
  if (isReadonly(target)) {
    __DEV__ &&
      warn(`Delete operation on key "${key}" failed: target is readonly.`)
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.DELETE,
      target: target,
      key
    })
  } else {
    ob.dep.notify()
  }
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 当数组被触发时，收集对数组元素的依赖关系，因为我们不能像属性getter那样拦截数组元素访问。
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    if (e && e.__ob__) {
      e.__ob__.dep.depend()
    }
    if (isArray(e)) {
      dependArray(e)
    }
  }
}
