interface IMetaObjectProtocol {
  axHasPublicProperty(mn: Shumway.AVMX.Multiname): boolean;
  axHasPropertyInternal(mn: Shumway.AVMX.Multiname): boolean;
  axHasOwnProperty(mn: Shumway.AVMX.Multiname): boolean;
  axSetProperty(mn: Shumway.AVMX.Multiname, value: any);
  axSetPublicProperty(nm: any, value: any);
  axNextNameIndex(index: number);
  axEnumerableKeys: any [];
  axGetEnumerableKeys(): any [];
}

interface Function {
  axApply(thisArg: any, argArray?: any[]): any;
  axCall(thisArg: any): any;
}

interface Object extends IMetaObjectProtocol {

}

var $: Shumway.AVMX.SecurityDomain = null;

module Shumway.AVMX {
  /*
   *     +--------------------------+
   *     |      Base Prototype      |
   *     +--------------------------+
   *     |- axHasPropertyInternal   |
   *     |- axHasProperty           |            +-------------------+
   *     |- axSetProperty           |     +-----#|  objectPrototype  |
   *     |- axGetProperty           |     |      +-------------------+
   *     |- axSetPublicProperty     |     |      | - securityDomain  |
   *     |- axGetSlot               |<----+      +-------------------+
   *     |- axSetSlot               |     |
   *     |  …                       |     |
   *     |                          |     |      +-------------------+
   *     |                          |     +-----#|  objectPrototype  |
   *     |                          |            +-------------------+
   *     +--------------------------+            | - securityDomain  |
   *                                             +-------------------+
   *                                                       ^
   *                                                       |
   *                                                       |
   *                                                       #
   *     +-----------------+                        +------------+
   *  +-#|  Class Object   |----------------------->| tPrototype |<-----------------<--------------------+
   *  |  +-----------------+                        +------------+                  |                    |
   *  |                                                    ^                        |                    |
   *  |                                                    |                        |                    |
   *  |                                                    |--------+               |                    |
   *  |                                                    |        |               #                    #
   *  |                         +------------+             |        |      +-----------------+  +-----------------+
   *  |                         | - traits   |             #        |      |     Number      |  |      Uint       |
   *  |  +-----------------+    +------------+      +------------+  |      +-----------------+  +-----------------+
   *  +-#|   Class Class   |--->| tPrototype |#---->| dPrototype |  |      | - value         |  | - value         |
   *  |  +-----------------+    +------------+      +------------+  |      +-----------------+  +-----------------+
   *  |                                ^                            |
   *  |                                |                            |      +-----------------+  +-----------------+
   *  +--------------------------------+----------------------------+-----#|     Boolean     |  |      Array      |
   *  |                                                             |      +-----------------+  +-----------------+
   *  |                                                             |      | - value         |  | - value         |
   *  |  +-----------------+    +------------+      +------------+  |      +-----------------+  +-----------------+
   *  +-#|     Class A     |--->| tPrototype |#---->| dPrototype |#-+
   *  |  +-----------------+    +------------+      +------------+         +-----------------+  +-----------------+
   *  |                         | - traits   |--+          ^               |       Int       |  |    Function     |
   *  |                         +------------+  |          |               +-----------------+  +-----------------+
   *  |                                ^        |          |               | - value         |  | - value         |
   *  |                                |        |          +--------+      +-----------------+  +-----------------+
   *  |                                #        |                   |
   *  |                         +------------+  |   +------------+  |      +-----------------+
   *  |                         |  Object A  |  +-->|   Traits   |  |      |     String      |
   *  |                         +------------+      +------------+  |      +-----------------+
   *  |                                                             |      | - value         |
   *  |                                                             |      +-----------------+
   *  |                                                             |
   *  |                                                             |
   *  |                                                             |
   *  |                                                             |
   *  |                                                             |
   *  | +-----------------+     +------------+      +------------+  |
   *  +#|Class B extends A|---->| tPrototype |#---->| dPrototype |#-+
   *    +-----------------+     +------------+      +------------+
   *                            | - traits   |
   *                            +------------+
   *
   */
  export enum WriterFlags {
    None = 0,
    Runtime = 1,
    Interpreter = 2
  }

  var writer = new IndentingWriter();
  export var runtimeWriter = null;
  export var interpreterWriter = null;

  export function sliceArguments(args, offset: number = 0) {
    return Array.prototype.slice.call(args, offset);
  }

  export function setWriters(flags: WriterFlags) {
    runtimeWriter = (flags & WriterFlags.Runtime) ? writer : null;
    interpreterWriter = (flags & WriterFlags.Runtime) ? writer : null;
  }

  export enum ScriptInfoState {
    None = 0,
    Executing = 1,
    Executed = 2
  }

  import assert = Shumway.Debug.assert;
  import defineNonEnumerableProperty = Shumway.ObjectUtilities.defineNonEnumerableProperty;

  import defineNonEnumerableGetterOrSetter = Shumway.ObjectUtilities.defineNonEnumerableGetterOrSetter;
  import getOwnPropertyDescriptor = Shumway.ObjectUtilities.getOwnPropertyDescriptor;
  import ASClass = Shumway.AVMX.AS.ASClass;

  function axApplyIdentity(self, args) {
    return args[0];
  }

  function axBoxIdentity(args) {
    return args[0];
  }

  function axBoxPrimitive(value) {
    var boxed = Object.create(this.tPrototype);
    boxed.value = value;
    return boxed;
  }

  function axCoerceObject(x) {
    if (x == null) {
      return null;
    }
    return x;
  }

  function axApplyObject(_, args) {
    var x = args[0];
    if (x == null) {
      return Object.create(this.tPrototype);
    }
    return x;
  }

  function axConstructObject(args) {
    var x = args[0];
    if (x == null) {
      return Object.create(this.tPrototype);
    }
    return x;
  }

  export function asCoerceInt(x): number {
    return x | 0;
  }

  export function asCoerceUint(x): number {
    return x >>> 0;
  }

  export function asCoerceNumber(x): number {
    return +x;
  }

  export function asCoerceBoolean(x): boolean {
    return !!x;
  }

  /**
   * Similar to |toString| but returns |null| for |null| or |undefined| instead
   * of "null" or "undefined".
   */
  export function asCoerceString(x): string {
    if (typeof x === "string") {
      return x;
    } else if (x == undefined) {
      return null;
    }
    return x + '';
  }

  export function asConvertString(x): string {
    if (typeof x === "string") {
      return x;
    }
    return x + '';
  }

  export function axIsTypeNumber(x): boolean {
    return typeof x === "number";
  }

  export function axIsTypeInt(x): boolean {
    return typeof x === "number" && ((x | 0) === x);
  }

  export function axIsTypeUint(x): boolean {
    return typeof x === "number" && ((x >>> 0) === x);
  }

  export function axIsTypeBoolean(x): boolean {
    return typeof x === "boolean";
  }

  export function axIsTypeString(x): boolean {
    return typeof x === "string";
  }

  export function axFalse(): boolean {
    return false;
  }

  export function axDefaultCompareFunction(a, b) {
    return String(a).localeCompare(String(b));
  }

  export function axCompare(a: any, b: any, options: SORT, sortOrder: number,
                            compareFunction: (a, b) => number) {
    release || Shumway.Debug.assertNotImplemented(!(options & SORT.UNIQUESORT), "UNIQUESORT");
    release || Shumway.Debug.assertNotImplemented(!(options & SORT.RETURNINDEXEDARRAY),
                                                  "RETURNINDEXEDARRAY");
    var result = 0;
    if (options & SORT.CASEINSENSITIVE) {
      a = String(a).toLowerCase();
      b = String(b).toLowerCase();
    }
    if (options & SORT.NUMERIC) {
      a = +a;
      b = +b;
      result = a < b ? -1 : (a > b ? 1 : 0);
    } else {
      result = compareFunction(a, b);
    }
    return result * sortOrder;
  }

  export function axCompareFields(objA: any, objB: any, names: string[], optionsList: SORT[]) {
    release || assert(names.length === optionsList.length);
    release || assert(names.length > 0);
    var result = 0;
    var i;
    for (i = 0; i < names.length && result === 0; i++) {
      var name = names[i];
      var a = objA[name];
      var b = objB[name];
      var options = optionsList[i];
      if (options & SORT.CASEINSENSITIVE) {
        a = String(a).toLowerCase();
        b = String(b).toLowerCase();
      }
      if (options & SORT.NUMERIC) {
        a = +a;
        b = +b;
        result = a < b ? -1 : (a > b ? 1 : 0);
      } else {
        result = String(a).localeCompare(String(b));
      }
    }
    if (optionsList[i - 1] & SORT.DESCENDING) {
      result *= -1;
    }
    return result;
  }

  /**
   * ActionScript 3 has different behaviour when deciding whether to call toString or valueOf
   * when one operand is a string. Unlike JavaScript, it calls toString if one operand is a
   * string and valueOf otherwise. This sucks, but we have to emulate this behaviour because
   * YouTube depends on it.
   *
   * AS3 also overloads the `+` operator to concatenate XMLs/XMLLists instead of stringifying them.
   */
  export function asAdd(l: any, r: any): any {
    if (typeof l === "string" || typeof r === "string") {
      return String(l) + String(r);
    }
    if (isXMLCollection(l) && isXMLCollection(r)) {
      // FIXME
      // return AS.ASXMLList.addXML(l, r);
    }
    return l + r;
  }

  function isXMLCollection(x): boolean {
    // FIXME
    return false;
    //return x instanceof AS.ASXML ||
    //       x instanceof AS.ASXMLList;
  }

  function isXMLType(x): boolean {
    // FIX ME
    return false;
    //return x instanceof AS.ASXML ||
    //       x instanceof AS.ASXMLList ||
    //       x instanceof AS.ASQName ||
    //       x instanceof AS.ASNamespace;
  }

  export function asEquals(left: any, right: any): boolean {
    // See E4X spec, 11.5 Equality Operators for why this is required.
    if (isXMLType(left)) {
      return left.equals(right);
    }
    if (isXMLType(right)) {
      return right.equals(left);
    }
    return left == right;
  }

  /**
   * These values are allowed to exist without being boxed.
   */
  function isPrimitiveJSValue(value: any) {
    return value === null || value === undefined || typeof value === "number" ||
           typeof value === "string" || typeof value === "boolean";

  }

  function isValidASValue(value: any) {
    return AXBasePrototype.isPrototypeOf(value) || isPrimitiveJSValue(value);
  }

  function checkValue(value: any) {
    release || assert(isValidASValue(value),
                      "Value: " + value + " is not allowed to flow into AS3.");
  }

  function axHasPropertyInternal(mn: Multiname): boolean {
    return this.axResolveMultiname(mn) in this;
  }

  function axHasProperty(mn: Multiname): boolean {
    return this.axHasPropertyInternal(mn);
  }

  function axHasPublicProperty(name: any): boolean {
    rn.name = name;
    return this.axHasProperty(rn);
  }

  function axResolveMultiname(mn: Multiname): any {
    if (mn.isRuntimeName() && isNumeric(mn.name)) {
      return mn.name;
    }
    var t = this.traits.getTrait(mn, -1);
    if (t) {
      return t.getName().getMangledName();
    }
    return mn.getPublicMangledName();
  }

  function axSetProperty(mn: Multiname, value: any) {
    release || assert(isValidASValue(value));
    this[this.axResolveMultiname(mn)] = value;
  }

  function axGetProperty(mn: Multiname): any {
    var value = this[this.axResolveMultiname(mn)];
    release || checkValue(value);
    return value;
  }

  function axDeleteProperty(mn: Multiname): any {
    // Cannot delete traits.
    if (this.traits.getTrait(mn)) {
      return false;
    }
    return delete this[mn.getPublicMangledName()];
  }

  function axCallProperty(mn: Multiname, args: any []): any {
    return this[this.axResolveMultiname(mn)].axApply(this, args);
  }

  function axCallSuper(mn: Multiname, scope: Scope, args: any []): any {
    var name = this.axResolveMultiname(mn);
    var fun = (<AXClass>scope.parent.object).tPrototype[name];
    return fun.axApply(this, args);
  }

  function axConstructProperty(mn: Multiname, args: any []): any {
    return this[this.axResolveMultiname(mn)].axConstruct(args);
  }

  var rn = new Multiname(null, 0, CONSTANT.RTQNameL, [Namespace.PUBLIC], null);

  export function axGetEnumerableKeys(): any [] {
    var self: AXObject = this;
    if (this.securityDomain.isPrimitive(this)) {
      return [];
    }
    var keys = Object.keys(this);
    var result = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (isNumeric(key)) {
        result.push(key);
      } else {
        var name = Multiname.stripPublicMangledName(key);
        if (name !== undefined) {
          result.push(name);
        }
      }
    }
    return result;
  }

  /**
   * Gets the next name index of an object. Index |zero| is actually not an
   * index, but rather an indicator to start the iteration.
   */
  export function axNextNameIndex(index: number) {
    var self: AXObject = this;
    if (index === 0) {
      // Gather all enumerable keys since we're starting a new iteration.
      defineNonEnumerableProperty(self, "axEnumerableKeys", self.axGetEnumerableKeys());
    }
    var axEnumerableKeys = self.axEnumerableKeys;
    while (index < axEnumerableKeys.length) {
      rn.name = axEnumerableKeys[index];
      if (self.axHasPropertyInternal(rn)) {
        return index + 1;
      }
      index ++;
    }
    return 0;
  }

  /**
   * Gets the nextName after the specified |index|, which you would expect to
   * be index + 1, but it's actually index - 1;
   */
  export function axNextName(index: number): any {
    var self: AXObject = this;
    var axEnumerableKeys = self.axEnumerableKeys;
    release || assert(axEnumerableKeys && index > 0 && index < axEnumerableKeys.length + 1);
    return axEnumerableKeys[index - 1];
  }

  export function axNextValue(index: number): any {
    return this.axGetPublicProperty(this.axNextName(index));
  }

  function axFunctionConstruct() {
    release || assert(this.prototype);
    var object = Object.create(this.prototype);
    this.value.apply(object, arguments);
    return object;
  }

  export function axGetPublicProperty(name: any): any {
    return this[Multiname.getPublicMangledName(name)];
  }

  export function axSetPublicProperty(name: any, value: any) {
    release || checkValue(value);
    this[Multiname.getPublicMangledName(name)] = value;
  }

  export function axGetSlot(i: number) {
    var t = this.traits.getSlot(i);
    var value = this[t.getName().getMangledName()];
    release || checkValue(value);
    return value;
  }

  export function axSetSlot(i: number, value: any) {
    var t = this.traits.getSlot(i);
    release || checkValue(value);
    this[t.getName().getMangledName()] = value;
    //var slotInfo = object.asSlots.byID[index];
    //if (slotInfo.const) {
    //  return;
    //}
    //var name = slotInfo.name;
    //var type = slotInfo.type;
    //if (type && type.coerce) {
    //  object[name] = type.coerce(value);
    //} else {
    //  object[name] = value;
    //}
  }

  export function asTypeOf(x: any): string {
    return typeof x;
  }

  function axCoerce(x: any) {
    // FIXME
    return null;
  }

  function axIsTypeObject(x: any) {
    // FIXME
    return Object.isPrototypeOf.call(this.dPrototype, this.securityDomain.box(x));
  }

  function axAsType(x: any): any {
    return this.axIsType(x) ? x : null;
  }

  function axIsInstanceOfObject(x: any) {
    return Object.isPrototypeOf.call(this.dPrototype, this.securityDomain.box(x));
  }

  /**
   * All objects with Traits must implement this interface.
   */
  export interface ITraits {
    traits: Traits;
    securityDomain: SecurityDomain;
  }

  export class Scope {
    parent: Scope;
    global: Scope;
    object: AXObject;
    isWith: boolean;
    cache: any;

    constructor(parent: Scope, object: any, isWith: boolean = false) {
      this.parent = parent;
      this.object = object;
      this.global = parent ? parent.global : this;
      this.isWith = isWith;
      this.cache = [];
    }

    public findDepth(object: any): number {
      var current = this;
      var depth = 0;
      while (current) {
        if (current.object === object) {
          return depth;
        }
        depth++;
        current = current.parent;
      }
      return -1;
    }

    public getScopeObjects(): Object [] {
      var objects = [];
      var current = this;
      while (current) {
        objects.unshift(current.object);
        current = current.parent;
      }
      return objects;
    }

    public getScopeProperty(mn: Multiname, strict: boolean, scopeOnly: boolean): any {
      return this.findScopeProperty(mn, strict, scopeOnly).axGetProperty(mn);
    }

    public findScopeProperty(mn: Multiname, strict: boolean, scopeOnly: boolean): any {
      var object;
      if (!scopeOnly && !mn.isRuntime()) {
        if ((object = this.cache[mn.id])) {
          return object;
        }
      }
      // Scope lookups should not be trapped by proxies.
      if (this.object.axHasPropertyInternal(mn)) {
        return (this.isWith || mn.isRuntime()) ? this.object : (this.cache[mn.id] = this.object);
      }
      if (this.parent) {
        var object = this.parent.findScopeProperty(mn, strict, scopeOnly);
        if (mn.kind === CONSTANT.QName) {
          this.cache[mn.id] = object;
        }
        return object;
      }
      if (scopeOnly) {
        return null;
      }

      // Attributes can't be stored on globals or be directly defined in scripts.
      if (mn.isAttribute()) {
        throwError("ReferenceError", Errors.UndefinedVarError, mn.name);
      }

      // If we can't find the property look in the domain.
      var globalObject = <AXGlobal><any>this.global.object;
      if ((object = globalObject.applicationDomain.findProperty(mn, strict, true))) {
        return object;
      }

      // If we still haven't found it, look for dynamic properties on the global.
      // No need to do this for non-strict lookups as we'll end up returning the
      // global anyways.
      if (strict) {
        if (!(mn.getPublicMangledName() in globalObject)) {
          throwError("ReferenceError", Errors.UndefinedVarError, mn.name);
        }
      }

      // Can't find it still, return the global object.
      return globalObject;
    }
  }

  function createMethodForTrait(methodTraitInfo: MethodTraitInfo, scope: Scope) {
    if (methodTraitInfo.method) {
      return methodTraitInfo.method;
    }
    var methodInfo = methodTraitInfo.getMethodInfo();
    var method;
    if (methodInfo.flags & METHOD.Native) {
      var metadata = methodInfo.getNativeMetadata();
      if (metadata) {
        method = AS.getNative(metadata.getValueAt(0));
      } else {
        method = AS.getMethodOrAccessorNative(methodTraitInfo);
      }
      release || assert(method, "Cannot find native: " + methodTraitInfo);
    } else {
      method = function () {
        var self = this === jsGlobal ? scope.global.object : this;
        return interpret(self, methodInfo, scope, sliceArguments(arguments));
      };
    }
    if (!release) {
      method.toString = function () {
        return "Interpret " + methodTraitInfo.toString();
      }
    }
    methodTraitInfo.method = method;
    return method;
  }

  export function applyTraits(object: ITraits, traits: Traits, scope: Scope) {
    object.traits = traits;
    var T = traits.traits;
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      var mangledName = t.getName().getMangledName();
      if (t.kind === TRAIT.Method || t.kind === TRAIT.Getter || t.kind === TRAIT.Setter) {
        var method = createMethodForTrait(<MethodTraitInfo>t, scope);
        if (t.kind === TRAIT.Method) {
          defineNonEnumerableProperty(object, mangledName,
                                      object.securityDomain.AXFunction.axBox(method));
        } else {
          defineNonEnumerableGetterOrSetter(object, mangledName, method, t.kind === TRAIT.Getter)
        }
      } else if (t.kind === TRAIT.Slot || t.kind === TRAIT.Const) {
        var s = <SlotTraitInfo>t;
        if (s.hasDefaultValue()) {
          defineNonEnumerableProperty(object, mangledName, s.getDefaultValue());
        }
      }
    }
  }

  // The Object that's at the root of all AXObjects' prototype chain, regardless of their
  // SecurityDomain.
  export var AXBasePrototype = Object.create(null);

  var D = defineNonEnumerableProperty;
  D(AXBasePrototype, "axHasPropertyInternal", axHasPropertyInternal);
  D(AXBasePrototype, "axHasProperty", axHasProperty);
  D(AXBasePrototype, "axSetProperty", axSetProperty);
  D(AXBasePrototype, "axHasProperty", axHasProperty);
  D(AXBasePrototype, "axHasPublicProperty", axHasPublicProperty);
  D(AXBasePrototype, "axSetPublicProperty", axSetPublicProperty);
  D(AXBasePrototype, "axGetPublicProperty", axGetPublicProperty);
  D(AXBasePrototype, "axGetProperty", axGetProperty);
  D(AXBasePrototype, "axDeleteProperty", axDeleteProperty);
  D(AXBasePrototype, "axSetSlot", axSetSlot);
  D(AXBasePrototype, "axGetSlot", axGetSlot);
  D(AXBasePrototype, "axCallProperty", axCallProperty);
  D(AXBasePrototype, "axCallSuper", axCallSuper);
  D(AXBasePrototype, "axConstructProperty", axConstructProperty);
  D(AXBasePrototype, "axResolveMultiname", axResolveMultiname);
  D(AXBasePrototype, "axNextNameIndex", axNextNameIndex);
  D(AXBasePrototype, "axNextName", axNextName);
  D(AXBasePrototype, "axNextValue", axNextValue);
  D(AXBasePrototype, "axGetEnumerableKeys", axGetEnumerableKeys);

  // Helper methods borrowed from Object.prototype.
  D(AXBasePrototype, "isPrototypeOf", Object.prototype.isPrototypeOf);
  D(AXBasePrototype, "hasOwnProperty", Object.prototype.hasOwnProperty);

  AXBasePrototype.$BgtoString = function() {
    return "[object Object]";
  };
  AXBasePrototype.toString = function () {
    return this.$BgtoString.axCall(this);
  };
  AXBasePrototype.$BgvalueOf = function() {
    return this;
  };
  AXBasePrototype.valueOf = function () {
    return this.$BgvalueOf.axCall(this);
  };

  export interface AXObject extends ITraits {
    $BgtoString: AXCallable;
    $BgvalueOf: AXCallable;
  }

  export interface AXGlobal extends AXObject {
    securityDomain: SecurityDomain;
    applicationDomain: ApplicationDomain;
    scriptInfo: ScriptInfo;
    scope: Scope;
  }

  export interface AXClass extends AXObject {
    scope: Scope;
    superClass: AXClass;
    classInfo: ClassInfo;
    tPrototype: AXObject;
    dPrototype: AXObject;
    axBox: any;
    axInitializer: any;
    axConstruct: any;
    axApply: any;
    axCoerce: any;
    axIsType: any;
    axAsType: any;
    axIsInstanceOf: any;
  }

  export interface AXFunction extends ITraits, AXObject {
    axApply(thisArg: any, argArray?: any[]): any;
    axCall(thisArg: any): any;
  }

  /**
   * Can be used wherever both AXFunctions and raw JS functions are valid values.
   */
  export interface AXCallable {
    axApply(thisArg: any, argArray?: any[]): any;
    axCall(thisArg: any): any;
  }

  // Add the |axApply| and |axCall| methods on the function prototype so that we can treat
  // Functions as AXCallables.
  Function.prototype.axApply = Function.prototype.apply;
  Function.prototype.axCall = Function.prototype.call;

  export interface AXActivation extends ITraits {

  }

  export interface AXCatch extends ITraits {

  }

  /**
   * Make sure we bottom out at the securityDomain's objectPrototype.
   */
  export function safeGetPrototypeOf(object: AXObject): AXObject {
    var prototype = Object.getPrototypeOf(object);
    if (prototype.hasOwnProperty("traits")) {
      return safeGetPrototypeOf(prototype);
    }
    if (!prototype.securityDomain) {
      return null;
    }
    if (prototype.securityDomain.objectPrototype === object) {
      return null;
    }
    return prototype;
  }

  export class HasNext2Info {
    constructor(public object: AXObject, public index: number) {
      // ...
    }

    /**
     * Determine if the given object has any more properties after the specified |index| and if so,
     * return the next index or |zero| otherwise. If the |obj| has no more properties then continue
     * the search in
     * |obj.__proto__|. This function returns an updated index and object to be used during
     * iteration.
     *
     * the |for (x in obj) { ... }| statement is compiled into the following pseudo bytecode:
     *
     * index = 0;
     * while (true) {
     *   (obj, index) = hasNext2(obj, index);
     *   if (index) { #1
     *     x = nextName(obj, index); #2
     *   } else {
     *     break;
     *   }
     * }
     *
     * #1 If we return zero, the iteration stops.
     * #2 The spec says we need to get the nextName at index + 1, but it's actually index - 1, this
     * caused me two hours of my life that I will probably never get back.
     *
     * TODO: We can't match the iteration order semantics of Action Script, hopefully programmers
     * don't rely on it.
     */
    next(object: AXObject, index: number) {
      this.object = object;
      this.index = index;
      if (isNullOrUndefined(this.object)) {
        this.index = 0;
        this.object = null;
        return;
      }
      var object = this.object;
      var nextIndex = object.axNextNameIndex(this.index);
      if (nextIndex > 0) {
        this.index = nextIndex;
        this.object = object;
        return;
      }
      // If there are no more properties in the object then follow the prototype chain.
      while (true) {
        var object = safeGetPrototypeOf(object);
        if (!object) {
          this.index = 0;
          this.object = null;
          return;
        }
        nextIndex = object.axNextNameIndex(0);
        if (nextIndex > 0) {
          this.index = nextIndex;
          this.object = object;
          return;
        }
      }
    }
  }

  /**
   * Generic axConstruct method that lives on the AXClass prototype. This just
   * creates an empty object with the right prototype and then calls the
   * instance initializer.
   *
   * TODO: Flatten out the argArray, or create an alternate helper ax helper to
   * make object construction faster.
   */
  function axConstruct(argArray?: any[]) {
    var self: AXClass = this;
    var object = Object.create(self.tPrototype);
    self.axInitializer.apply(object, argArray);
    return object;
  }

  /**
   * Default initializer.
   */
  function axDefaultInitializer() {
    // Nop.
  }

  /**
   * Throwing initializer for interfaces.
   */
  function axInterfaceInitializer() {
    throwError("VerifierError", Errors.NotImplementedError, this.classInfo.instanceInfo.name.name);
  }

  /**
   * Default axApply.
   */
  function axDefaultApply(self, args: any []) {
    // TODO: Coerce.
    return args ? args[0] : undefined;
  }

  /**
   * Provides security isolation between application domains.
   */
  export class SecurityDomain {
    public system: ApplicationDomain;
    public application: ApplicationDomain;
    public AXObject: AXClass;
    public AXArray: AXClass;
    public AXClass: AXClass;
    public AXFunction: AXClass;
    public AXNumber: AXClass;
    public AXString: AXClass;
    public AXBoolean: AXClass;

    private AXPrimitiveBox;
    private AXGlobalPrototype;
    private AXActivationPrototype;
    private AXCatchPrototype;

    public objectPrototype: AXObject;
    private rootClassPrototype: AXObject;

    private nativeClasses: any;

    constructor() {
      this.system = new ApplicationDomain(this, null);
      this.application = new ApplicationDomain(this, this.system);
      this.nativeClasses = Object.create(null);
    }

    findDefiningABC(mn: Multiname): ABCFile {
      return null;
    }

    throwError(className: string, error: any, replacement1?: any,
               replacement2?: any, replacement3?: any, replacement4?: any) {
      var message = formatErrorMessage.apply(null, sliceArguments(arguments, 1));
      this.throwErrorFromVM(className, message, error.code);
    }

    throwErrorFromVM(errorClass: string, message: string, id: number) {
      rn.namespaces = [Namespace.PUBLIC];
      rn.name = errorClass;
      var axClass: AXClass = <any>this.application.getProperty(rn, true, true);
      throw axClass.axConstruct([message, id])
    }

    applyType(methodInfo: MethodInfo, axClass: AXClass, types: AXClass []): AXClass {
      var factoryClassName = axClass.classInfo.instanceInfo.getName().name;
      if (factoryClassName === "Vector") {
        release || assert(types.length === 1);
        var type = types[0];
        var typeClassName;
        if (!isNullOrUndefined(type)) {
          typeClassName = type.classInfo.instanceInfo.getName().name.toLowerCase();
          switch (typeClassName) {
            case "number":
              typeClassName = "double";
            case "int":
            case "uint":
            case "double":
              rn.namespaces = [Namespace.VECTOR_PACKAGE];
              rn.name = "Vector$" + typeClassName;
              return <AXClass>methodInfo.abc.applicationDomain.getProperty(rn, true, true);
              break;
          }
        }
        rn.namespaces = [Namespace.VECTOR_PACKAGE];
        rn.name = "Vector$object";
        var objectVector = <any>methodInfo.abc.applicationDomain.getProperty(rn, true, true);
        return objectVector.applyType(objectVector, type);
      } else {
        Shumway.Debug.notImplemented(factoryClassName);
      }
    }

    /**
     * Used for factory types. This creates a class that by default behaves the same
     * as its factory class but gives us the opportunity to override protocol
     * handlers.
     */
    createSyntheticClass(superClass: AXClass): AXClass {
      var axClass = Object.create(this.AXClass.tPrototype);
      // Put the superClass tPrototype on the prototype chain so we have access
      // to all factory protocol handlers by default.
      axClass.tPrototype = Object.create(superClass.tPrototype);
      // We don't need a new dPrototype object.
      axClass.dPrototype = superClass.dPrototype;
      return axClass;
    }

    createClass(classInfo: ClassInfo, superClass: AXClass, scope: Scope): AXClass {
      var axClass: AXClass;

      var className = classInfo.instanceInfo.getName().name;
      var classScope: Scope;
      if (this.nativeClasses[className]) {
        axClass = this.nativeClasses[className];
        classScope = new Scope(scope, axClass);
        release || assert(axClass.dPrototype);
        release || assert(axClass.tPrototype);
      } else if (classInfo.instanceInfo.isInterface()) {
        axClass = Object.create(this.AXClass.tPrototype);
        axClass.dPrototype = Object.create(this.objectPrototype);
        axClass.tPrototype = Object.create(axClass.dPrototype);
        axClass.axInitializer = axInterfaceInitializer;
      } else {
        axClass = Object.create(this.AXClass.tPrototype);
        // For direct descendants of Object, we want the dynamic prototype to inherit from
        // Object's tPrototype because Foo.prototype is always a proper instance of Object.
        // For all other cases, the dynamic prototype should extend the parent class's
        // dynamic prototype not the tPrototype.
        if (superClass === this.AXObject) {
          axClass.dPrototype = Object.create(this.objectPrototype);
        } else {
          axClass.dPrototype = Object.create(superClass.dPrototype);
        }
        axClass.tPrototype = Object.create(axClass.dPrototype);
        classScope = new Scope(scope, axClass);
        axClass.axInitializer = this.createInitializerFunction(classInfo, classScope);
        axClass.axCoerce = function () {
          assert(false, "TODO: Coercing constructor.");
        };
      }

      axClass.classInfo = (<any>axClass.dPrototype).classInfo = classInfo;
      axClass.superClass = superClass;
      axClass.scope = scope;

      // Add the |constructor| property on the class traits prototype so that all instances can
      // get to their class constructor.
      defineNonEnumerableProperty(axClass.tPrototype, "$Bgconstructor", axClass);

      // Prepare static traits.
      var staticTraits = this.AXClass.classInfo.instanceInfo.traits.concat(classInfo.traits);
      staticTraits.resolve();
      axClass.traits = staticTraits;
      applyTraits(axClass, staticTraits, classScope);

      // Prepare instance traits.
      var instanceTraits = superClass ?
                           superClass.classInfo.instanceInfo.runtimeTraits.concat(classInfo.instanceInfo.traits) :
                           classInfo.instanceInfo.traits;
      instanceTraits.resolve();
      classInfo.instanceInfo.runtimeTraits = instanceTraits;
      axClass.tPrototype.traits = instanceTraits;
      applyTraits(axClass.tPrototype, instanceTraits, classScope);

      // Copy over all TS symbols.
      AS.tryLinkNativeClass(axClass);

      // Run the static initializer.
      interpret(axClass, classInfo.getInitializer(), classScope, [axClass]);
      return axClass;
    }

    createFunction(methodInfo: MethodInfo, scope: Scope, hasDynamicScope: boolean): AXFunction {
      return this.AXFunction.axBox(function () {
        var self = this === jsGlobal ? scope.global.object : this;
        return interpret(self, methodInfo, scope, sliceArguments(arguments));
      });
    }

    createInitializerFunction(classInfo: ClassInfo, scope: Scope): Function {
      var nativeInitializer = AS.getNativeInitializer(classInfo);
      if (nativeInitializer) {
        return nativeInitializer;
      }
      var methodInfo = classInfo.instanceInfo.getInitializer();
      return function () {
        return interpret(this, methodInfo, scope, sliceArguments(arguments));
      };
    }

    createActivation(methodInfo: MethodInfo): AXActivation {
      var body = methodInfo.getBody();
      if (!body.activationPrototype) {
        body.traits.resolve();
        body.activationPrototype = Object.create(this.AXActivationPrototype);
        (<any>body.activationPrototype).traits = body.traits;
      }
      return Object.create(body.activationPrototype);
    }

    createCatch(exceptionInfo: ExceptionInfo): AXCatch {
      if (!exceptionInfo.catchPrototype) {
        var traits = exceptionInfo.getTraits();
        exceptionInfo.catchPrototype = Object.create(this.AXCatchPrototype);
        (<any>exceptionInfo.catchPrototype).traits = traits;
      }
      return Object.create(exceptionInfo.catchPrototype);
    }

    box(v: any) {
      if (v == undefined) {
        return v;
      }
      if (AXBasePrototype.isPrototypeOf(v)) {
        return v;
      }
      if (v instanceof Array) {
        return this.AXArray.axBox(v);
      }
      if (typeof v === "number") {
        return this.AXNumber.axBox(v);
      }
      if (typeof v === "boolean") {
        return this.AXBoolean.axBox(v);
      }
      if (typeof v === "string") {
        return this.AXString.axBox(v);
      }
      assert(false, "Cannot box: " + v);
    }

    isPrimitive(v: any) {
      return isPrimitiveJSValue(v) || this.AXPrimitiveBox.dPrototype.isPrototypeOf(v);
    }

    createAXGlobal(applicationDomain: ApplicationDomain, scriptInfo: ScriptInfo) {
      var global: AXGlobal = Object.create(this.AXGlobalPrototype);
      global.securityDomain = this;
      global.applicationDomain = applicationDomain;
      global.scriptInfo = scriptInfo;
      global.traits = scriptInfo.traits;
      global.traits.resolve();
      global.scope = new Scope(null, global, false);
      applyTraits(global, global.traits, global.scope);
      return global;
    }

    /**
     * Prepares the dynamic Class prototype that all Class instances (including Class) have in
     * their prototype chain.
     *
     * This prototype defines the default hooks for all classes. Classes can override some or
     * all of them.
     */
    prepareRootClassPrototype() {
      var dynamicClassPrototype: AXObject = Object.create(this.objectPrototype);
      var rootClassPrototype: AXObject = Object.create(dynamicClassPrototype);
      rootClassPrototype.$BgtoString = function axClassToString() {
        return "[class " + this.classInfo.instanceInfo.getName().name + "]";
      };

      var D = defineNonEnumerableProperty;
      D(rootClassPrototype, "axApply", axApplyIdentity);
      D(rootClassPrototype, "axBox", axBoxIdentity);
      D(rootClassPrototype, "axCoerce", axCoerce);
      D(rootClassPrototype, "axIsType", axIsTypeObject);
      D(rootClassPrototype, "axAsType", axAsType);
      D(rootClassPrototype, "axIsInstanceOf", axIsInstanceOfObject);
      D(rootClassPrototype, "axConstruct", axConstruct);
      D(rootClassPrototype, "axInitializer", axDefaultInitializer);
      D(rootClassPrototype, "axApply", axDefaultApply);

      this.rootClassPrototype = rootClassPrototype;
    }

    prepareNativeClass(exportName: string, name: string, isPrimitiveClass: boolean) {
      var axClass: AXClass = Object.create(this.rootClassPrototype);

      // For Object and Class, we've already created the instance prototype to break
      // circular dependencies.
      if (name === 'Object') {
        axClass.dPrototype = <any>Object.getPrototypeOf(this.objectPrototype);
        axClass.tPrototype = this.objectPrototype;
      } else if (name === 'Class') {
        axClass.dPrototype = <any>Object.getPrototypeOf(this.rootClassPrototype);
        axClass.tPrototype = this.rootClassPrototype;
      } else {
        var instancePrototype = isPrimitiveClass ?
                                this.AXPrimitiveBox.dPrototype :
                                this.objectPrototype;
        axClass.dPrototype = Object.create(instancePrototype);
        axClass.tPrototype = Object.create(axClass.dPrototype);
      }
      this[exportName] = this.nativeClasses[name] = axClass;
      return axClass;
    }

    preparePrimitiveClass(exportName: string, name: string, convert, coerce, isType, isInstanceOf) {
      var axClass = this.prepareNativeClass(exportName, name, true);
      var D = defineNonEnumerableProperty;
      D(axClass, 'axBox', axBoxPrimitive);
      D(axClass, "axApply", function axApply(_ , args: any []) {
        return convert(args ? args[0] : undefined);
      });
      D(axClass, "axConstruct", function axConstruct(args: any []) {
        return convert(args ? args[0] : undefined);
      });
      D(axClass, "axCoerce", coerce);
      D(axClass, "axIsType", isType);
      D(axClass, "axIsInstanceOf", isInstanceOf);
      D(axClass.tPrototype, "$BgtoString", function() { return this.value.toString(); });
    }

    /**
     * Configures all the builtin Objects.
     */
    initialize() {
      var D = defineNonEnumerableProperty;
      var P = function setPublicProperty(object, name, value) {
        defineNonEnumerableProperty(object, Multiname.getPublicMangledName(name), AXFunction.axBox(value));
      };

      // Some facts:
      // - The Class constructor is itself an instance of Class.
      // - The Class constructor is an instance of Object.
      // - The Object constructor is an instance of Class.
      // - The Object constructor is an instance of Object.
      
      // The basic dynamic prototype that all objects in this security domain have in common.
      var dynamicObjectPrototype = Object.create(AXBasePrototype);
      dynamicObjectPrototype.securityDomain = this;
      // The basic traits prototype that all objects in this security domain have in common.
      this.objectPrototype = Object.create(dynamicObjectPrototype);

      this.prepareRootClassPrototype();
      var AXClass = this.prepareNativeClass("AXClass", "Class", false);
      var classClassInfo = this.system.findClassInfo("Class");
      classClassInfo.instanceInfo.traits.resolve();
      AXClass.classInfo = classClassInfo;

      var AXObject = this.prepareNativeClass("AXObject", "Object", false);
      // Object(null) creates an object, and this behaves differently than:
      // (function (x: Object) { trace (x); })(null) which prints null.
      D(AXObject, "axApply", axApplyObject);
      D(AXObject, "axConstruct", axConstructObject);
      D(AXObject, "axCoerce", axCoerceObject);

      // Debugging Helper
      release || (this.objectPrototype['trace'] = function trace() {
        var self = this;
        var writer = new IndentingWriter();
        this.traits.traits.forEach(t => {
          writer.writeLn(t + ": " + self[t.getName().getMangledName()]);
        });
      });

      this.AXGlobalPrototype = Object.create(this.objectPrototype);
      this.AXGlobalPrototype.$BgtoString = function() {
        return '[object global]';
      };

      this.AXActivationPrototype = Object.create(this.objectPrototype);
      this.AXActivationPrototype.$BgtoString = function() {
        return '[Activation]';
      };

      this.AXCatchPrototype = Object.create(this.objectPrototype);
      this.AXCatchPrototype.$BgtoString = function() {
        return '[Catch]';
      };

      var AXFunction = this.prepareNativeClass("AXFunction", "Function", false);
      D(AXFunction, "axBox", axBoxPrimitive);
      D(AXFunction.dPrototype, "axCall", AS.ASFunction.prototype.axCall);
      D(AXFunction.dPrototype, "axApply", AS.ASFunction.prototype.axApply);
      D(AXFunction.tPrototype, '$BgtoString', AXFunction.axBox(function () {
        return "[Function Object]";
      }));

      D(AXFunction, "axConstruct", function() { return Object.create(this.tPrototype);});
      D(AXFunction.dPrototype, "axConstruct", axFunctionConstruct);

      P(AXFunction.dPrototype, "call", function (self, a, b, c) {
        if (this.securityDomain.isPrimitive(self)) {
          self = null;
        }
        switch (arguments.length) {
          case 0: return this.value.call();
          case 1: return this.value.call(self);
          case 2: return this.value.call(self, a);
          case 3: return this.value.call(self, a, b);
          case 4: return this.value.call(self, a, b, c);
        }
        return this.value.apply(self, sliceArguments(arguments, 1));
      });

      P(AXFunction.dPrototype, "apply", function (self, args) {
        if (this.securityDomain.isPrimitive(self)) {
          self = null;
        }
        return this.value.apply(self, args.value);
      });

      var AXArray = this.prepareNativeClass("AXArray", "Array", false);
      D(AXArray, 'axBox', axBoxPrimitive);
      AXArray.tPrototype.$BgtoString = AXFunction.axBox(function () {
        return this.value.toString();
      });
      // Array.prototype is an Array, and behaves like one.
      AXArray.dPrototype['value'] = [];
      var Ap = AS.ASArray.prototype;
      P(AXArray.dPrototype, "push", Ap.push);
      P(AXArray.dPrototype, "pop", Ap.pop);
      P(AXArray.dPrototype, "shift", Ap.shift);
      P(AXArray.dPrototype, "unshift", Ap.unshift);
      P(AXArray.dPrototype, "reverse", Ap.reverse);
      P(AXArray.dPrototype, "concat", Ap.concat);
      P(AXArray.dPrototype, "slice", Ap.slice);
      P(AXArray.dPrototype, "join", Ap.join);
      P(AXArray.dPrototype, "toString", Ap.toString);
      P(AXArray.dPrototype, "indexOf", Ap.indexOf);
      P(AXArray.dPrototype, "lastIndexOf", Ap.lastIndexOf);
      P(AXArray.dPrototype, "every", Ap.every);
      P(AXArray.dPrototype, "some", Ap.some);
      P(AXArray.dPrototype, "forEach", Ap.forEach);
      P(AXArray.dPrototype, "map", Ap.map);
      P(AXArray.dPrototype, "filter", Ap.filter);
      P(AXArray.dPrototype, "sort", Ap.sort);
      P(AXArray.dPrototype, "sortOn", Ap.sortOn);

      // Boolean, int, Number, String, and uint are primitives in AS3. We create a placeholder
      // base class to help us with instanceof tests.
      var AXPrimitiveBox = this.prepareNativeClass("AXPrimitiveBox", "PrimitiveBox", false);
      D(AXPrimitiveBox.dPrototype, '$BgtoString',
        AXFunction.axBox(function () { return this.value.toString(); }));
      var AXBoolean = this.preparePrimitiveClass("AXBoolean", "Boolean", asCoerceBoolean,
                                                 asCoerceBoolean, axIsTypeBoolean, axIsTypeBoolean);
      var AXString = this.preparePrimitiveClass("AXString", "String", asConvertString,
                                                 asCoerceString, axIsTypeString, axIsTypeString);
      var AXNumber = this.preparePrimitiveClass("AXNumber", "Number", asCoerceNumber,
                                                asCoerceNumber, axIsTypeNumber, axIsTypeNumber);
      var AXInt = this.preparePrimitiveClass("AXInt", "int", asCoerceInt, asCoerceInt,
                                             axIsTypeInt, axFalse);
      var AXUint = this.preparePrimitiveClass("AXUint", "uint", asCoerceUint, asCoerceUint,
                                              axIsTypeUint, axFalse);
    }
  }

  /**
   * All code lives within an application domain.
   */
  export class ApplicationDomain {
    /**
     * All application domains have a reference to the root, or system application domain.
     */
    public system: ApplicationDomain;

    /**
     * Parent application domain.
     */
    public parent: ApplicationDomain;

    public securityDomain: SecurityDomain;

    private _abcs: ABCFile [];

    constructor(securityDomain: SecurityDomain, parent: ApplicationDomain) {
      this.securityDomain = securityDomain;
      this.parent = parent;
      this.system = parent ? parent.system : this;
      this._abcs = [];
    }

    public loadABC(abc: ABCFile) {
      assert (this._abcs.indexOf(abc) < 0);
      this._abcs.push(abc);
      abc.setApplicationDomain(this);
    }

    public loadAndExecuteABC(abc: ABCFile) {
      this.loadABC(abc);
      this.executeABC(abc);
    }

    public executeABC(abc: ABCFile) {
      var lastScript = abc.scripts[abc.scripts.length - 1];
      this.executeScript(lastScript);
    }

    public findClassInfo(name: string) {
      for (var i = 0; i < this._abcs.length; i++) {
        var abc = this._abcs[i];
        for (var j = 0; j < abc.instances.length; j++) {
          var c = abc.classes[j];
          if (c.instanceInfo.getName().name === name) {
            return c;
          }
        }
      }
      return null;
    }

    public executeScript(scriptInfo: ScriptInfo) {
      assert (scriptInfo.state === ScriptInfoState.None);

      runtimeWriter && runtimeWriter.writeLn("Running Script: " + scriptInfo);
      var global = this.securityDomain.createAXGlobal(this, scriptInfo);
      scriptInfo.global = global;
      scriptInfo.state = ScriptInfoState.Executing;
      interpret(<any>global, scriptInfo.getInitializer(), global.scope, []);
      scriptInfo.state = ScriptInfoState.Executed;
    }

    public findProperty(mn: Multiname, strict: boolean, execute: boolean): AXGlobal {
      var script = this.findDefiningScript(mn, execute);
      if (script) {
        return script.global;
      }
      return null;
    }

    public getClass(mn: Multiname): AXClass {
      return <any>this.getProperty(mn, true, true);
    }

    public getProperty(mn: Multiname, strict: boolean, execute: boolean): AXObject {
      var global: any = this.findProperty(mn, strict, execute);
      if (global) {
        return global.axGetProperty(mn);
      }
      return null;
    }

    public findDefiningScript(mn: Multiname, execute: boolean): ScriptInfo {
      // Look in parent domain first.
      if (this.parent) {
        var script = this.parent.findDefiningScript(mn, execute);
        if (script) {
          return script;
        }
      }

      // Search through the loaded abcs.
      for (var i = 0; i < this._abcs.length; i++) {
        var abc = this._abcs[i];
        var scripts = abc.scripts;
        for (var j = 0; j < scripts.length; j++) {
          var script = scripts[j];
          var traits = script.traits;
          traits.resolve();
          var index = traits.indexOf(mn, -1);
          if (index >= 0) {
            if (execute) {
              this._ensureScriptIsExecuted(script);
            }
            return script;
          }
        }
      }

      // Still no luck, so let's ask the security domain to load additional ABCs and try again.
      var abc = this.system.securityDomain.findDefiningABC(mn);
      if (abc) {
        this.loadABC(abc);
        return this.findDefiningScript(mn, execute);
      }

      return null;
    }

    private _ensureScriptIsExecuted(script: ScriptInfo) {
      if (script.state === ScriptInfoState.None) {
        this.executeScript(script);
      }
    }
  }

  export function createMethod(methodInfo: MethodInfo, scope: Scope, hasDynamicScope: boolean) {
    return function () {
      return interpret(this, methodInfo, scope, sliceArguments(arguments));
    }
  }
}
