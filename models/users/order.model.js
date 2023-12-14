let mongoose = require("mongoose");
let mongoosePaginate = require("mongoose-paginate-v2");
let veriant = new mongoose.Schema({
    veriant: {
        type: mongoose.Types.ObjectId,
        require: true
    },
    price: {
        type: Number,
        require: true
    },
    quantity: {
        type: Number,
        require: true
    },
    total_price: {
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
        type: Boolean,
        default: true
    }
});
let schema = new mongoose.Schema({
    orderId: {
        type: String,
        require:  true
    },
    veriants: [veriant],
    paymentId: {
        type: String,
        require:  true
    },
	addressId: {
		type: mongoose.Types.ObjectId,
		require: true
	},
    is_pending: {
        type: Boolean,
        default: true
    },
    is_conform: {
        type: Boolean,
        default: false
    },
    is_cancelled: {
        type: Boolean,
        default: false
    },
    is_read_to_ship: {
        type: Boolean,
        default: false
    },
    is_shipped: {
        type: Boolean,
        default: false
    },
    is_delivered: {
        type: Boolean,
        default: false
    },
    is_rto: {
        type: Boolean,
        default: false
    },
    is_download: {
        type: Boolean,
        default: false
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