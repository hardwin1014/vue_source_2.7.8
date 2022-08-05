import type { GlobalAPI } from 'types/global-api'
import { toArray, isFunction } from '../util/index'

// 将vue的构造函数传入
export function initUse(Vue: GlobalAPI) {
  // 给Vue增加了use方法，接收了一个参数plugin(插件可以是函数，也可以是对象（any）)
  Vue.use = function (plugin: Function | any) {
    // installedPlugins定义了之前所有安装的插件
    // 获取this，此时的this._installedPlugins是vue的构造函数的this
    // 获取vue构造函数的_installedPlugins，如果没有值就初始化成空数组
    // _installedPlugins属性内部记录了所有安装的插件
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = [])

    // 1. 判断当前插件在数组中是否存在，如果已经注册了，就返回Vue实例
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // 2.如果没有注册，下面是注册的过程

    // 2.1 对参数进行处理
    // arguments是什么传入的参数，因为第一个是参数是plugin，不是我们想要的参数，所以要删掉
    // 把arguments转换为数组，把数组中的第一个元素（plugin）去除，并将vue实例添加到第一个来,因为插件执行需要vue实例
    const args = toArray(arguments, 1)
    // 把this(Vue)插入第一个元素的位置，后面方便使用Vue实例调用插件
    args.unshift(this)


    // 2.2 如果传入插件的install是函数的话,直接执行
    // 这就是然后要传入一个对象的话，就必须实现install方法，然后调用install方法
    // args就是plugin.install、plugin的参数
    if (isFunction(plugin.install)) {

      // 就调用插件install方法，传入args参数
      // 使用apply转换this指向，如果是install方法，就属于apply把this改成plugin
      // 传入的args是一个数组,调用的时候会展开，第一个参数就是Vue。在调用install的时候，第一个参数要求就是Vue
      plugin.install.apply(plugin, args)
    } else if (isFunction(plugin)) {
      // 如果传入直接是一个函数的话，就直接调用这个函数
      plugin.apply(null, args)
    }

    // 注册好插件后，将插件存储到插件数组中
    installedPlugins.push(plugin)
    // 返回Vue
    return this
  }
}
