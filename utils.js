module.exports.getSafe = (p, o, d) => {
  return p.reduce((xs, x) => (xs && xs[x] != null && xs[x] != undefined) ? xs[x] : d, o);
};
