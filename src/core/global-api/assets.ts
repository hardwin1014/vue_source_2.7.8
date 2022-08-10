import { ASSET_TYPES } from 'shared/constants'
import type { GlobalAPI } from 'types/global-api'
import { isFunction, isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   * 遍历ASSET_TYPES数组，为Vue定义相应方法
   * ASSET_TYPES包括了'component', 'directive', 'filter'
   */
  ASSET_TYPES.forEach(type => {
    // @ts-expect-error function is not exact same type
    // 参数分别为id和定义
    Vue[type] = function (
      id: string,
      definition?: Function | Object
    ): Function | Object | void {
      // 定义是否传了，如果没传会找到之前options中定义的Vue.components, Vue.directives, Vue.filters，这些最终都会存储到this.options中
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        // 判断当前类型是否是组件
        if (__DEV__ && type === 'component') {
          validateComponentName(id)
        }
        // 判断组件是否是原始的Object对象，如果组件传入一个构造函数，直接执行最后一句
        if (type === 'component' && isPlainObject(definition)) {
          // @ts-expect-error
          // 给组件设置名字，如果组件中设置了名字就使用组件中的名字，如果没传，就使用id
          definition.name = definition.name || id
          // 把组件配置转换为组件的构造函数    Vue.options._base = Vue
          // 相当于Vue.extend把一个普通的对象转换成Vue component的构造函数
          definition = this.options._base.extend(definition)
        }

        // 如果是指令，如果是指令直接注册，如果是函数，会进行处理，会将function设置给bind和update这两个方法
        if (type === 'directive' && isFunction(definition)) {
          definition = { bind: definition, update: definition }
        }
        // 最终都会全局注册，存储在Vue.options对应的名字下
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
