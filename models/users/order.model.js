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
    fullfill_status: {
        type: String,
        enum: ['pending' , 'ready_to_ship' , 'shipped' , 'delivered' , 'rto' , 'cancelled']
    },
    financial_status: {
        type: String,
        enum: ['accept' , 'pending' , 'refund']
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