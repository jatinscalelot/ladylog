let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
	category: {
		type: mongoose.Types.ObjectId,
		require: true
	},
	symptom_name: {
		type: String,
		require: true
	},
	fill_icon: {
		type: String,
		require: true
	},
	unfill_icon: {
		type: String,
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