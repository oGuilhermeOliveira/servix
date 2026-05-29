/** Evita que promises de rede travem a interface indefinidamente. */
export function withTimeout(promise, ms, label) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error((label || "Operacao") + " demorou demais. Tente de novo."));
    }, ms);
    Promise.resolve(promise)
      .then(function (value) {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(function (error) {
        clearTimeout(timer);
        reject(error);
      });
  });
}
