let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
	product: {
		type: mongoose.Types.ObjectId,
		require: true
	},
	size: {
		type: mongoose.Types.ObjectId,
		require: true
	},
	SKUID: {
		type: String,
		require: true
	},
	stock: {
		type: Number,
		require: true
	},
	price: {
		type: Number,
		require: true
	},
	sgst: {
		type: Number,
		require: true
	},
	cgst: {
		type: Number,
		require: true
	},
	gross_amount: {
		type: Number,
		require: true
	},
	discount_per: {
		type: Number,
		require: true
	},
	discount_amount: {
		type: Number,
		require: true
	},
	discount: {
		type: Number,
		require: true
	},
	discounted_amount: {
		type: Number,
		require: true
	},
  status: {
		type:Boolean,
		default: false
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