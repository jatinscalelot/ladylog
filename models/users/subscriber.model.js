let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
  paymentId: {
    type: String,
    require: true
  },
  plan: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  size: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  address: {
    type: mongoose.Types.ObjectId,
    require: true
  },
  status: {
    type: Boolean,
    default: true
  },
	createdBy: {
		type: mongoose.Types.ObjectId,
		default: null
	},
	updatedBy: {
		type: mongoose.Types.ObjectId,
		default: null
	}
}, { timestamps: true, strict: false, autoIndex: true });
schema.plugin(mongoosePaginate);
module.exports = schema;