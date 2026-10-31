const slugify = require("slugify");

module.exports = (name) => slugify(name, { lower: true, strict: true, locale: "fr" });
