let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
	title: {
		type: String,
		require: true
	},
	header: {
		type: String,
		require: true
	},
	writer_name: {
		type: String,
		require: true
	},
	description: {
		type: String,
		require: true
	},
	status: {
		type:Boolean,
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