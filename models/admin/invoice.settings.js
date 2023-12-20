let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let schema = new mongoose.Schema({
    company_name: {
        type: String,
        require: true
    },
    company_email: {
        type: String,
        require: true
    },
    company_address: {
        type: String,
        require: true
    },
    bank_name: {
        type: String,
        require: true
    },
    bank_ifsc: {
        type: String,
        require: true
    },
    bank_account_no: {
        type: Number,
        require: true
    },
    pan_card: {
        type: String,
        require: true
    },
    gst_no: {
        type: String,
        require: true
    },
    support_mobile_no: {
        type: String,
        require: true
    },
    support_email: {
        type: String,
        require: true
    },
    tc: {
        type: String,
        require: true
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