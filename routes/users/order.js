const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const addressModel = require('../../models/users/address.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const reviewModel = require('../../models/users/review.model');
const orderModel = require('../../models/users/order.model');
const sizeMasterModel = require('../../models/admin/size.master');
const async = require('async');

function addWorkingDays(orderAt_timestamp){
    let deliverAt = new Date(orderAt_timestamp);
    let count = 1;
    while (count < 7){
        if((deliverAt.getDay() == 0 || deliverAt.getDay() == 6)){
            deliverAt.setDate(deliverAt.getDate()+1);
            continue;
        }
        deliverAt.setDate(deliverAt.getDate()+1);
        count++;
    }
    let deliver_timestamp = deliverAt.getTime();
    return {deliverAt , deliver_timestamp};
}

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {page , limit} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                createdBy: new mongoose.Types.ObjectId(userData._id),
            },{
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status financial_status total_quantity total_discounted_amount orderAt deliverAt',
                sort: {createdAt: -1},
                lean: true
            }).then((orders) => {
                return responseManager.onSuccess('My orders...!' , orders ,  res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
    const {orderId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(orderId && orderId.trim() != ''){
                let orderData = await primary.model(constants.MODELS.orders , orderModel).findOne({orderId: orderId}).populate([
                    {path: 'veriants.veriant' , model: primary.model(constants.MODELS.veriants , veriantModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                    {path: 'addressId' , model: primary.model(constants.MODELS.addresses , addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                ]).select('-is_download -shipped_by -status -createdBy -updatedBy -__v').lean();
                if(orderData && orderData != null){
                    async.forEachSeries(orderData.veriants, (veriant , next_veriant) => {
                        ( async () => {
                            let productData = await primary.model(constants.MODELS.products , productModel).findById(veriant.veriant.product).select('-cod -status -createdBy -updatedBy -createdAt -updatedAt -__v').lean();
                            let noofreview = parseInt(await primary.model(constants.MODELS.reviews, reviewModel).countDocuments({product: productData._id}));
                            if(noofreview > 0){
                                let totalReviewsCountObj = await primary.model(constants.MODELS.reviews, reviewModel).aggregate([{$match: {product: productData._id}} , {$group: {_id: null , sum: {$sum: '$rating'}}}]);
                                if(totalReviewsCountObj && totalReviewsCountObj.length > 0 && totalReviewsCountObj[0].sum){
                                    productData.ratings = parseFloat((totalReviewsCountObj[0].sum / noofreview).toFixed(1));
                                }else{
                                    productData.ratings = 0.0
                                }
                            }else{
                                productData.ratings = 0.0;
                            }
                            veriant.veriant.product = productData;
                            let sizeData = await primary.model(constants.MODELS.sizemasters , sizeMasterModel).findById(veriant.veriant.size).select('_id size_name').lean();
                            veriant.veriant.size = sizeData;
                            next_veriant();
                        })().catch((error) => {
                            return responseManager.onError(error , res);
                        });
                    }, () => {
                        return responseManager.onSuccess('Order details...!' , orderData , res);
                    });
                }else{
                    return responseManager.badrequest({message: 'Invalid order id to get order details...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid order id to get order details...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/create' , helper.authenticateToken , async (req , res) => {
    const {paymentId , veriants , addressId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(paymentId && paymentId.trim() != ''){
                if(addressId && addressId.trim() != '' && mongoose.Types.ObjectId.isValid(addressId)){
                    let addressData = await primary.model(constants.MODELS.addresses, addressModel).findOne({_id: new mongoose.Types.ObjectId(addressId) , createdBy: userData._id}).lean();
                    if(addressData && addressData != null && addressData.status === true){
                        if(veriants && Array.isArray(veriants) && veriants.length > 0){
                            const finalVeriants = [];
                            let total_quantity = 0;
                            let total_price = 0.0;
                            let total_sgst = 0.0;
                            let total_cgst = 0.0;
                            let total_gst = 0.0;
                            let total_gross_amount = 0.0;
                            let total_discount= 0.0;
                            let total_discounted_amount = 0.0;
                            async.forEachSeries(veriants, (veriant , next_veriant) => {
                                (async () => {
                                    if(veriant._id && veriant._id.trim() != '' && mongoose.Types.ObjectId.isValid(veriant._id) && veriant.quantity && Number.isInteger(veriant.quantity) && !(isNaN(veriant.quantity)) && veriant.quantity > 0){
                                        let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriant._id).lean();
                                        if(veriantData && veriantData != null && veriantData.status === true){
                                            let quantity = parseInt(veriant.quantity);
                                            let price = parseFloat(parseFloat(veriantData.price).toFixed(2));
                                            let totalprice = parseFloat((parseInt(veriant.quantity) * price).toFixed(2));
                                            let sgst = parseFloat(parseFloat(parseFloat(parseFloat(totalprice) * 9) / 100).toFixed(2));
                                            let cgst = parseFloat(parseFloat(parseFloat(parseFloat(totalprice) * 9) / 100).toFixed(2));
                                            let gst = parseFloat(parseFloat(sgst + cgst).toFixed(2));
                                            let gross_amount = parseFloat(parseFloat(totalprice + sgst + cgst).toFixed(2));
                                            let discount = 0;
                                            let discounted_amount = 0.0;
                                            if(veriantData.discount_per && veriantData.discount_per > 0){
                                                discount = parseFloat(parseFloat(parseFloat(parseFloat(gross_amount) * parseFloat(veriantData.discount_per)) / 100).toFixed(2));
                                                discounted_amount = parseFloat((gross_amount - discount).toFixed(2));
                                            }else if(veriantData.discount_amount && veriantData.discount_amount > 0){
                                                discount = parseFloat((veriantData.discount_amount * parseInt(veriant.quantity)).toFixed(2))
                                                discounted_amount = parseFloat((gross_amount - discount).toFixed(2));
                                            }else{
                                                discounted_amount = parseFloat(gross_amount);
                                            }
                                            total_quantity += quantity;
                                            total_price += totalprice;
                                            total_sgst += sgst;
                                            total_cgst += cgst;
                                            total_gst += gst;
                                            total_gross_amount += gross_amount;
                                            total_discount += discount;
                                            total_discounted_amount += discounted_amount;
                                            let veriantObj = {
                                                veriant: new mongoose.Types.ObjectId(veriantData._id),
                                                price: parseFloat(parseFloat(veriantData.price).toFixed(2)),
                                                quantity: parseInt(veriant.quantity),
                                                total_price: parseFloat(totalprice.toFixed(2)),
                                                sgst: parseFloat(parseFloat(sgst).toFixed(2)),
                                                cgst: parseFloat(parseFloat(cgst).toFixed(2)),
                                                gst: parseFloat(parseFloat(gst).toFixed(2)),
                                                gross_amount: parseFloat(parseFloat(gross_amount).toFixed(2)),
                                                discount_per: parseFloat(veriantData.discount_per),
                                                discount_amount: parseFloat(veriantData.discount_amount),
                                                discount: parseFloat(parseFloat(discount).toFixed(2)),
                                                discounted_amount: parseFloat(parseFloat(discounted_amount).toFixed(2)),
                                                status: true
                                            };
                                            finalVeriants.push(veriantObj);
                                            next_veriant();
                                        }else{
                                            return responseManager.badrequest({message: 'Invalid product veriant or quantity..!'}, res);
                                        }
                                    }else{
                                        return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res);
                                    }
                                })().catch((error) => {
                                    return responseManager.onError(error , res);
                                });
                            }, () => {
                                ( async () => {
                                    let noOfOrders = await primary.model(constants.MODELS.orders, orderModel).count();
                                    let orderId = helper.generateOrderId(noOfOrders+1);
                                    let orderAt = new Date();
                                    let orderAt_timestamp = orderAt.getTime();
                                    let {deliverAt , deliver_timestamp} = addWorkingDays(orderAt_timestamp);
                                    let orderObj = {
                                        orderId: orderId,
                                        veriants: finalVeriants,
                                        paymentId: paymentId.trim(),
                                        addressId: new mongoose.Types.ObjectId(addressData._id),
                                        fullfill_status: 'pending',
                                        financial_status: 'paid',
                                        total_quantity: parseInt(total_quantity),
                                        total_price: parseFloat(parseFloat(total_price).toFixed(2)),
                                        total_sgst: parseFloat(parseFloat(total_sgst).toFixed(2)),
                                        total_cgst: parseFloat(parseFloat(total_cgst).toFixed(2)),
                                        total_gst: parseFloat(parseFloat(total_gst).toFixed(2)),
                                        total_gross_amount: parseFloat(parseFloat(total_gross_amount).toFixed(2)),
                                        total_discount: parseFloat(parseFloat(total_discount).toFixed(2)),
                                        total_discounted_amount: parseFloat(parseFloat(total_discounted_amount).toFixed(2)),
                                        orderAt: orderAt,
                                        orderAt_timestamp: parseInt(orderAt_timestamp),
                                        deliverAt: deliverAt,
                                        deliver_timestamp: parseInt(deliver_timestamp),
                                        createdBy: new mongoose.Types.ObjectId(userData._id)
                                    };
                                    let newOrder = await primary.model(constants.MODELS.orders, orderModel).create(orderObj);
                                    let data = {
                                        orderId: newOrder.orderId,
                                        deliverAt: newOrder.deliverAt
                                    };
                                    return responseManager.onSuccess('Order placed successfully...!' , data , res);
                                })().catch((error) => {
                                    return responseManager.onError(error , res);
                                });
                            });
                        }else{
                            return responseManager.badrequest({message: 'No products veriants found...!'}, res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Invalid id to get address...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get address...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid id to get payment details...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);     
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/cancel' , helper.authenticateToken , async (req , res) => {
    const {orderId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            if(orderId && orderId.trim() != ''){
                let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                if(orderData && orderData != null){
                    if(orderData.fullfill_status === 'pending' || orderData.fullfill_status === 'ready_to_ship'){
                        if(orderData.financial_status === 'accept'){
                            let obj = {
                                fullfill_status: 'cancelled',
                                financial_status: 'refund',
                                cancelledAt: new Date(),
                                updatedBy: new mongoose.Types.ObjectId(userData._id),
                                updatedAt: new Date()
                            };
                            let updatedOrederData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false}).lean();
                            return responseManager.onSuccess('Order cancel succesfully...!', 1 , res);
                        }else{
                            let obj = {
                                fullfill_status: 'cancelled',
                                cancelledAt: new Date(),
                                updatedBy: new mongoose.Types.ObjectId(userData._id),
                                updatedAt: new Date()
                            };
                            let updatedOrederData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false}).lean();
                            return responseManager.onSuccess('Order cancel succesfully...!', 1 , res);
                        }
                    }else{
                        if(orderData.fullfill_status === 'shipped'){
                            return responseManager.badrequest({message: 'Order is shipped, You can not cancel order now...!'}, res);
                        }else if(orderData.fullfill_status === 'delivered'){
                            return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                        }else if(orderData.fullfill_status === 'rto'){
                            return responseManager.badrequest({message: 'Order in RTO...!'}, res);
                        }else{
                            return responseManager.badrequest({message: 'Order is already cancelled...!'}, res);
                        }
                    }
                }else{                    
                    return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
            }
        }else{            
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

module.exports = router;