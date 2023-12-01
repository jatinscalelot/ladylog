let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let productDetails = new mongoose.Schema({
	size: {
		type: mongoose.Types.ObjectId,
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
	}
});
let otherImages = new mongoose.Schema({
	path: {
		type: String,
		require: true
	}
});
let schema = new mongoose.Schema({
	title: {
		type: String,
		require: true
	},
	description: {
		type: String,
		require: true
	},
	bannerImage: {
		type: String,
		require: true
	},
	SKUID: {
		type: String,
		require: true
	},
	productDetails: [productDetails],
	otherImages: [otherImages],
	cod: {
		type: Boolean,
		default: false
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