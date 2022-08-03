import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 * 判断el是否是字符串，如果不是，那就是dom对象，直接返回
 */
export function query(el: string | Element): Element {
  if (typeof el === 'string') {
    // 如果是字符串，就认为是选择器，就使用querySelect找到dom，返回
    const selected = document.querySelector(el)
    // 如果没有找到，就判断是开发环境还是生产环境。开发环境就不打印错误了
    if (!selected) {
      __DEV__ && warn('Cannot find element: ' + el)
      // 然后创建一个div返回
      return document.createElement('div')
    }
    return selected
  } else {
    return el
  }
}
