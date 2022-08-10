import type { GlobalAPI } from 'types/global-api'
import { mergeOptions } from '../util/index'

export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    //将用户的选项和全局的options进行合并   注册到全局选项
    // 把mixin所有的成员拷贝到 options中
    // this就是Vue, Vue.options,  将mixins拷贝到全局中
    this.options = mergeOptions(this.options, mixin)
    return this// 将vue返回
  }
}
