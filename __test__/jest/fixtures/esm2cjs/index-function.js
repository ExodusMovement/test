import object from './object'
import fn from './function'
import Class from './class'
import * as named from './named'
import * as mixed from './mixed'

export const all = () => ({ object, fn, Class, named, mixed })
