import VNode from 'core/vdom/vnode'
import { namespaceMap } from 'web/util/index'

// 直接创建一个dom对象，把这个对象返回
export function createElement(tagName: string, vnode: VNode): Element {
  const elm = document.createElement(tagName)
  // 处理了一些select标签特殊的地方，如果不是select，直接返回
  if (tagName !== 'select') {
    return elm
  }
  // 如果是select，并判断data中有attrs,并且有multiple，那就将multiple属性设置到dom上来，并返回这个属性
  if (
    vnode.data &&
    vnode.data.attrs &&
    vnode.data.attrs.multiple !== undefined
  ) {
    elm.setAttribute('multiple', 'multiple')
  }
  return elm
}

export function createElementNS(namespace: string, tagName: string): Element {
  return document.createElementNS(namespaceMap[namespace], tagName)
}

export function createTextNode(text: string): Text {
  return document.createTextNode(text)
}

export function createComment(text: string): Comment {
  return document.createComment(text)
}

export function insertBefore(
  parentNode: Node,
  newNode: Node,
  referenceNode: Node
) {
  parentNode.insertBefore(newNode, referenceNode)
}

export function removeChild(node: Node, child: Node) {
  node.removeChild(child)
}

export function appendChild(node: Node, child: Node) {
  node.appendChild(child)
}

export function parentNode(node: Node) {
  return node.parentNode
}

export function nextSibling(node: Node) {
  return node.nextSibling
}

export function tagName(node: Element): string {
  return node.tagName
}

export function setTextContent(node: Node, text: string) {
  node.textContent = text
}

export function setStyleScope(node: Element, scopeId: string) {
  node.setAttribute(scopeId, '')
}
