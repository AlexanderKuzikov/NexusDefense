/* Заглушка three для проверки контракта вне браузера.
   Набор элементов использует three ТОЛЬКО внутри build()/геометрии —
   контракт и валидация их не вызывают. Поэтому достаточно формы
   объектов: конструкторы, методы-цепочки и константы.
   Если элемент начнёт обращаться к three на верхнем уровне модуля,
   заглушка это скроет, а не сломает — поэтому здесь ничего не
   вычисляется, всё отдаётся «пустышкой». */

const noop = () => chainable;

const chainable = new Proxy(function () {}, {
  get(_, k) {
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'isTexture' || k === 'isInstancedMesh') return false;
    if (k === 'valueOf') return () => 0;
    return chainable;
  },
  set() { return true; },
  apply() { return chainable; },
  construct() { return chainable; }
});

export const Mesh = chainable;
export const Group = chainable;
export const InstancedMesh = chainable;
export const Points = chainable;
export const Object3D = chainable;
export const PointLight = chainable;
export const Color = chainable;
export const Vector2 = chainable;
export const Vector3 = chainable;

export const MeshStandardMaterial = chainable;
export const MeshBasicMaterial = chainable;
export const ShaderMaterial = chainable;
export const PointsMaterial = chainable;

export const PlaneGeometry = chainable;
export const CircleGeometry = chainable;
export const CylinderGeometry = chainable;
export const BoxGeometry = chainable;
export const ConeGeometry = chainable;
export const DodecahedronGeometry = chainable;
export const BufferGeometry = chainable;
export const BufferAttribute = chainable;
export const Float32BufferAttribute = chainable;
export const DataTexture = chainable;

export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const BackSide = 1;
export const DoubleSide = 2;
export const FrontSide = 0;
export const RedFormat = 1023;
export const RGBAFormat = 1023;
export const FloatType = 1015;
export const UnsignedByteType = 1009;
export const LinearFilter = 1006;
export const NearestFilter = 1003;
export const ClampToEdgeWrapping = 1001;

export default chainable;
