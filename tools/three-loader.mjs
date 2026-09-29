/* Подмена импорта 'three' на заглушку для Node.
   Нужен, чтобы проверять контракт набора без npm-зависимостей:
   в браузере three приходит с unpkg, в Node пакета нет. */

export function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return { url: new URL('./three-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
