/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { TriggerOpTypes } from '../../v3'
import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建一个对象，原型指向arrayPrototype,指向数组构造函数的原型
export const arrayMethods = Object.create(arrayProto)

// 要修补的一些方法
// 数组的原生的方法不知道dep的存在，不能更新视图，这里使用ob.dep.notify通知视图修改
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // 1. 保存数组原方法
  // 使用arrayProto, 获取到数组构造函数的原型
  const original = arrayProto[method]
  // 2. 调用Object.defineProperty()   重新定义修改数组的方法
  // args是调用数组的方法传入的参数
  def(arrayMethods, method, function mutator(...args) {
    // 3.执行数组的原始方法，调用apply改变内部的this指向，获取到结果
    const result = original.apply(this, args)
    // 4. 因为这些改变了原数组的方法，需要做一些处理
    // 获取数组对象的ob对象
    const ob = this.__ob__
    let inserted // 用来存储数组中新增的元素
    switch (method) {
      // case里面没有break就会直接向下执行
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice': // splice的第三个元素是新增的值，把第三个值存储到inserted里面
        inserted = args.slice(2)
        break
    }
    // 5. 对插入的新元素，重新遍历数组元素，设置为响应式数据
    if (inserted) ob.observeArray(inserted)

    // 6. 通知视图更改
    // 调用了修改数组的方法，调用数组的ob对象中的dep的notify发送通知
    if (__DEV__) {
      ob.dep.notify({
        type: TriggerOpTypes.ARRAY_MUTATION,
        target: this,
        key: method
      })
    } else {
      ob.dep.notify()
    }
    // 7. 把结果返回
    return result
  })
})

// 因为这些改变了原数组的方法，需要做一些处理
/**
 * 找到新增元素的方法，将新增的元素存储起来，遍历新增的元素，为里面的对象添加响应式
 * 最后通知视图更新，返回结果
 * */
