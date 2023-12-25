const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const aws = require('../../utilities/aws');
const invoiceSettingsModel = require('../../models/admin/invoice.settings');
const adminModel = require('../../models/admin/admin.model');
const userModel = require('../../models/users/users.model');
const addressModel = require('../../models/users/address.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const orderModel = require('../../models/users/order.model');
const sizeMasterModel = require('../../models/admin/size.master');
const async = require('async');
const QRcode = require('qrcode');   
const puppeteer = require('puppeteer');
const PDFMerger = require('pdf-merger-js');
const fs = require('fs');
const axios = require('axios');

function currentDate(){
    const currentDateObject = new Date();

    const day = currentDateObject.getDate();
    const month = currentDateObject.getMonth() + 1;
    const year = currentDateObject.getFullYear();

    const formattedDay = (day < 10) ? `0${day}` : day;
    const formattedMonth = (month < 10) ? `0${month}` : month;

    const currentDate = `${formattedDay}/${formattedMonth}/${year}`;

    return currentDate;
}

router.get('/count' , helper.authenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            let pendingOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'pending'});
            let readyToShipOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'ready_to_ship'});
            let shippedOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'shipped'});
            let deliveredOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'delivered'});
            let rtoOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'rto'});
            let cancelledOrders = await primary.model(constants.MODELS.orders, orderModel).count({fullfill_status: 'cancelled'});
            let obj = {
                totalOrders: parseInt(pendingOrders + readyToShipOrders),
                pendingOrders: parseInt(pendingOrders),
                readyToShipOrders: parseInt(readyToShipOrders),
                shippedOrders: parseInt(shippedOrders),
                deliveredOrders: parseInt(deliveredOrders),
                rtoOrders: parseInt(rtoOrders),
                cancelledOrders: parseInt(cancelledOrders),
            };
            return responseManager.onSuccess('count...!' , obj , res);
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/getone' , helper.authenticateToken , async (req , res) => {
    const {orderId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderId && orderId.trim() != ''){
                let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).populate([
                    {path: 'veriants.veriant' , model: primary.model(constants.MODELS.veriants , veriantModel) , select: '-createdBy -updatedBy -createdAt -updatedAt -__v'},
                    {path: 'addressId' , model: primary.model(constants.MODELS.addresses , addressModel) , select: '-createdBy -updatedBy -createdAt -updatedAt -__v'},
                    {path: 'createdBy' , model: primary.model(constants.MODELS.users , userModel) , select: '_id name mobile'},
                ]).select('-status -__v').lean();
                if(orderData && orderData != null){
                    let totalObject = await primary.model(constants.MODELS.orders, orderModel).aggregate([
                        {$match: {_id: orderData._id}},
                        {$unwind: '$veriants'},
                        {$group: {
                            _id: null,
                            totalQuantity: {$sum: '$veriants.quantity'},
                            totalNetPrice: {$sum: '$veriants.total_price'},
                            totalSGST: {$sum: '$veriants.sgst'},
                            totalCGST: {$sum: '$veriants.cgst'},
                            totalGrossAmount: {$sum: '$veriants.gross_amount'},
                            totalDiscount: {$sum: '$veriants.discount'},
                            totalDiscountendPrice: {$sum: '$veriants.discounted_amount'},
                        }}
                    ]);
                    if(totalObject && totalObject.length > 0){
                        orderData.totalQuantity = parseInt(totalObject[0].totalQuantity);
                        orderData.totalNetPrice = parseFloat(parseFloat(totalObject[0].totalNetPrice).toFixed(2));
                        orderData.totalTax = parseFloat(parseFloat(totalObject[0].totalSGST + totalObject[0].totalCGST).toFixed(2));
                        orderData.totalGrossAmount = parseFloat(parseFloat(totalObject[0].totalGrossAmount).toFixed(2));
                        orderData.totalDiscount = parseFloat(parseFloat(totalObject[0].totalDiscount).toFixed(2));
                        orderData.totalDiscountendPrice = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                        orderData.totalPay = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                    }else{
                        orderData.totalQuantity = 0;
                        orderData.totalNetPrice = 0;
                        orderData.totalTax = 0;
                        orderData.totalGrossAmount = 0;
                        orderData.totalDiscount = 0;
                        orderData.totalDiscountendPrice = 0;
                        orderData.totalPay = 0;
                    }
                    async.forEachSeries(orderData.veriants , (veriant , next_veriant) => {
                        ( async () => {
                            let productData = await primary.model(constants.MODELS.products , productModel).findById(veriant.veriant.product).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
                            veriant.veriant.product = productData;
                            let sizeData = await primary.model(constants.MODELS.sizemasters , sizeMasterModel).findById(veriant.veriant.size).select('_id size_name').lean();
                            veriant.veriant.size = sizeData;
                            next_veriant();
                        })().catch((error) => {
                            return responseManager.onError(error , res);
                        });
                    },() => {
                        return responseManager.onSuccess('Order details...!' , orderData , res);
                    });
                }else{
                    return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
            }
        }else{            
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/pendingOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'pending'
            },{
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount createdAt updatedAt',
                sort: {createdAt: -1},
                lean: true
            }).then((pendingOrders) => {
                return responseManager.onSuccess('Pending orders...!' , pendingOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/acceptOrders' , helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
                let orderIdsToUpdate = [];
                async.forEachSeries(orderIds, (orderId , next_orderId) => {
                    ( async () => {
                        if(orderId && orderId.trim() != ''){
                            let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                            if(orderData && orderData != null){
                                if(orderData.fullfill_status === 'pending'){
                                    orderIdsToUpdate.push(orderData.orderId);
                                    next_orderId();
                                }else{
                                    if(orderData.fullfill_status === 'ready_to_ship'){
                                        return responseManager.badrequest({message: 'Order already accepted...!'}, res);
                                    }else if(orderData.fullfill_status === 'shipped'){
                                        return responseManager.badrequest({message: 'Order is shipped...!'}, res);
                                    }else if(orderData.fullfill_status === 'delivered'){
                                        return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                                    }else if(orderData.fullfill_status === 'rto'){
                                        return responseManager.badrequest({message: 'Order is rto...!'}, res);
                                    }else{
                                        return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
                                    }
                                }
                            }else{                                
                                return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                        }
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    ( async () => {
                        let obj = {
                            fullfill_status: 'ready_to_ship',
                            ready_to_shipped_date: new Date(),
                            ready_to_shipped_timestamp: Date.now(),
                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                            updatedAt: new Date()
                        };
                        let updatedOrdersData = await primary.model(constants.MODELS.orders, orderModel).updateMany({orderId: {$in: orderIdsToUpdate}} , obj , {returnOriginal: false}).lean();
                        return responseManager.onSuccess('All Order Accepted successfully...!' , 1 , res);
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                });
            }else{
                return responseManager.badrequest({message: 'Invalid orderid to get order detials...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/readyToShipOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'ready_to_ship',
            }, {
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount ready_to_shipped_date is_download createdAt updatedAt',
                sort: {createdAt: -1},
                lean: true
            }).then((readyToShipOrders) => {
                return responseManager.onSuccess('Ready to ship orders...!' , readyToShipOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/cancelOrders' ,  helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
                async.forEachSeries(orderIds, (orderId , next_orderId) => {
                    ( async () => {
                        if(orderId && orderId.trim() != ''){
                            let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                            if(orderData && orderData != null){
                                if(orderData.fullfill_status === 'pending'){
                                    if(orderData.financial_status === 'accept'){
                                        let obj = {
                                            fullfill_status: 'cancelled',
                                            financial_status: 'refund',
                                            refunded_amount: parseFloat(orderData.total_discounted_amount),
                                            cancelledAt: new Date(),
                                            cancelled_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let cancelledOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }else{
                                        let obj = {
                                            fullfill_status: 'cancelled',
                                            cancelledAt: new Date(),
                                            cancelled_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let cancelledOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }
                                    next_orderId();
                                }else{
                                    if(orderData.fullfill_status === 'ready_to_ship'){
                                        return responseManager.badrequest({message: 'Order in ready to ship, You can not cancelled order now...!'}, res);
                                    }else if(orderData.fullfill_status === 'shipped'){
                                        return responseManager.badrequest({message: 'Order is shipped...!'}, res);
                                    }else if(orderData.fullfill_status === 'delivered'){
                                        return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                                    }else if(orderData.fullfill_status === 'rto'){
                                        return responseManager.badrequest({message: 'Order in rto...!'}, res);
                                    }else{
                                        return responseManager.badrequest({message: 'Order is already cancelled...!'}, res);
                                    }
                                }
                            }else{                                
                                return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                        }
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('All Order calcelled successfully...!' , 1 , res);
                });
            }else{
                return responseManager.badrequest({message: 'Invalid orderid to get order detials...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/cancelledOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'cancelled'
            },{
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount refunded_amount cancelledAt refunded_amount updatedBy createdAt updatedAt',
                sort: {createdAt: -1},
                lean: true
            }).then((cancelledOrders) => {
                return responseManager.onSuccess('Cancelled orders...!' , cancelledOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/shippedOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'shipped',
            }, {
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount shipped_by shippedAt createdAt updatedAt',
                sort: {createdAt: -1},
                lean: true
            }).then((shippedOrders) => {
                return responseManager.onSuccess('Shipped orders...!' , shippedOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/deliverOrders' , helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
                async.forEachSeries(orderIds, (orderId , next_orderId) => {
                    ( async () => {
                        if(orderId && orderId.trim() != ''){
                            let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                            if(orderData && orderData != null){
                                if(orderData.fullfill_status === 'shipped'){
                                    if(orderData.financial_status === 'pending'){
                                        let obj = {
                                            fullfill_status: 'delivered',
                                            financial_status: 'accept',
                                            deliveredAt: new Date(),
                                            delivered_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let deliveredOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }else{
                                        let obj = {
                                            fullfill_status: 'delivered',
                                            deliveredAt: new Date(),
                                            delivered_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let deliveredOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }
                                    next_orderId();
                                }else{
                                    if(orderData.fullfill_status === 'pending'){
                                        return responseManager.badrequest({message: 'Order in pending, Please conform order first...!'}, res);
                                    }else if(orderData.fullfill_status === 'ready_to_ship'){
                                        return responseManager.badrequest({message: 'Order in ready to ship...!'}, res);
                                    }else if(orderData.fullfill_status === 'delivered'){
                                        return responseManager.badrequest({message: 'Order is already delivered...!'}, res);
                                    }else if(orderData.fullfill_status === 'rto'){
                                        return responseManager.badrequest({message: 'Order in rto...!'}, res);
                                    }else{
                                        return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
                                    }
                                }
                            }else{                                
                                return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                        }
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('All Order delivered successfully...!' , 1 , res);
                });
            }else{
                return responseManager.badrequest({message: 'Invalid orderid to get order detials...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/deliveredOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'delivered',
            }, {
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount deliveredAt createdAt updatedAt updatedBy',
                sort: {createdAt: -1},
                lean: true
            }).then((deliveredOrders) => {
                return responseManager.onSuccess('Delivered orders...!' , deliveredOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/rtoOrders' , helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
                async.forEachSeries(orderIds, (orderId , next_orderId) => {
                    ( async () => {
                        if(orderId && orderId.trim() != ''){
                            let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                            if(orderData && orderData != null){
                                if(orderData.fullfill_status === 'shipped'){
                                    if(orderData.financial_status === 'accept'){
                                        let obj = {
                                            fullfill_status: 'rto',
                                            financial_status: 'refund',
                                            refunded_amount: parseFloat(orderData.total_discounted_amount),
                                            rtoAt: new Date(),
                                            rto_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let rtoOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }else{
                                        let obj = {
                                            fullfill_status: 'rto',
                                            rtoAt: new Date(),
                                            rto_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let rtoOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }
                                    next_orderId();
                                }else{
                                    if(orderData.fullfill_status === 'pending'){
                                        return responseManager.badrequest({message: 'Order in pending, Please conform order first...!'}, res);
                                    }else if(orderData.fullfill_status === 'ready_to_ship'){
                                        return responseManager.badrequest({message: 'Order in ready to ship...!'}, res);
                                    }else if(orderData.fullfill_status === 'delivered'){
                                        return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                                    }else if(orderData.fullfill_status === 'rto'){
                                        return responseManager.badrequest({message: 'Order is already in rto...!'}, res);
                                    }else{
                                        return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
                                    }
                                }
                            }else{                                
                                return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Invalid orderid to get order details, Please try again...!'}, res);
                        }
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('All Order moved to rto successfully...!' , 1 , res);
                });
            }else{
                return responseManager.badrequest({message: 'Invalid orderid to get order detials...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/getRTOOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit , search} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                $or: [
                    {orderId: {$regex: search, $options: 'i'}},
                    {fullfill_status: {$regex: search, $options: 'i'}},
                    {financial_status: {$regex: search, $options: 'i'}},
                    {payment_type: {$regex: search, $options: 'i'}}
                ],
                fullfill_status: 'rto',
            }, {
                page,
                limit: parseInt(limit),
                select: '_id orderId fullfill_status paymentId financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount refunded_amount rtoAt refunded_amount createdAt updatedAt updatedBy',
                sort: {createdAt: -1},
                lean: true
            }).then((rtoOrders) => {
                return responseManager.onSuccess('RTO orders...!' , rtoOrders , res);
            }).catch((error) => {
                return responseManager.onError(error , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/downloadInvoice' , helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
                var merger = new PDFMerger();
                let veriants = '';
                let invoiceSettingsData = await primary.model(constants.MODELS.invoicesettings, invoiceSettingsModel).findById(new mongoose.Types.ObjectId('658144a9d5116a3bf6162c25')).lean();
                if(invoiceSettingsData && invoiceSettingsData != null){
                    let data = [];
                    async.forEachSeries(orderIds, (orderId , next_orderId) => {
                        ( async () => {
                            if(orderId && orderId.trim() != ''){
                                let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).populate([
                                    {path: 'veriants.veriant' , model: primary.model(constants.MODELS.veriants , veriantModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                                    {path: 'addressId' , model: primary.model(constants.MODELS.addresses , addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                                    {path: 'createdBy' , model: primary.model(constants.MODELS.users , userModel) , select: '_id name mobile'}
                                ]).select('-is_download -status -updatedBy -updatedAt -__v').lean();
                                if(orderData && orderData != null){
                                    console.log('fullfill status :',orderData.fullfill_status);
                                    if(orderData.fullfill_status === 'ready_to_ship'){
                                        if(orderData.invoiceNo && orderData.invoiceNo.trim() != '' && orderData.invoice_path && orderData.invoice_path.trim() != ''){
                                            const url = process.env.AWS_BUCKET_URI + orderData.invoice_path;
                                            const response = await axios.get(url,  { responseType: 'arraybuffer' });
                                            const buffer = Buffer.from(response.data, "utf-8");
                                            await merger.add(buffer);
                                            next_orderId();
                                        }else{
                                            async.forEachSeries(orderData.veriants, (veriant , next_veriant) => {
                                                ( async () => {
                                                    let productData = await primary.model(constants.MODELS.products, productModel).findById(veriant.veriant.product).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').lean();
                                                    veriant.veriant.product = productData;
                                                    let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(veriant.veriant.size).select('_id size_name').lean();
                                                    veriant.veriant.size = sizeData;
                                                    veriants += `
                                                    <tr>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.veriant.product.title}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.veriant.SKUID}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.veriant.size.size_name}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.quantity}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.total_price}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.discount}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">${veriant.gross_amount}</td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">
                                                            <table style="width: 100%;border: none;border-spacing: 0;">
                                                                <tbody>
                                                                <tr><td style="border: none;font-size: 14px;font-weight: 500;padding: 0;">GST @18.0%</td></tr>
                                                                <tr><td style="border: none;font-size: 14px;font-weight: 500;padding: 0;">Rs. ${veriant.sgst + veriant.cgst}</td></tr>
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                        <td style="font-size: 14px;font-weight: 500;padding: 8px 10px;border:2px solid black;border-spacing: 0;">Rs. ${veriant.discounted_amount}</td>
                                                    </tr>
                                                    `
                                                    next_veriant();
                                                })().catch((error) => {
                                                    return responseManager.onError(error , res);
                                                });
                                            }, () => {
                                                const invoiceNo = helper.generateINVOId(orderData.orderId);
                                                orderData.invoiceNo = invoiceNo;
                                                QRcode.toDataURL(orderData.orderId , (err , code) => {
                                                    ( async () => {
                                                        if(code){
                                                            orderData.QRcode = code;
                                                            const dateObject = new Date(orderData.createdAt);
                                                            const orderDate = dateObject.toLocaleDateString("en-GB");
                                                            const currentdate = currentDate();
                                                            let html= `
                                                            <!DOCTYPE html>
                                                            <html lang="en">
                                                            <head>
                                                            <meta charset="UTF-8">
                                                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                            <title>E-commerce || Invoice</title>
                                                            <style>
                                                                *{
                                                                margin: 0;
                                                                }
                                                            </style>
                                                            </head>
                                                            <body>
                                                                <table style="width: 1024px;margin: 0 auto;padding:15px;page-break-after: always;border: none;font-family: Arial, sans-serif;" border="1" cellspacing="10" cellpadding="0">
                                                                    <tbody>
                                                                    <tr>
                                                                        <td style="padding: 20px;border: none;">
                                                                        <table style="width: 100%;border-spacing: 0;">
                                                                            <tbody>
                                                                            <tr>
                                                                                <td>
                                                                                <table style="width: 100%;border-spacing: 0;border-collapse: collapse;">
                                                                                    <tbody>
                                                                                    <tr>
                                                                                        <td width="30%" style="padding: 10px;border:2px solid black;">
                                                                                        <span style="display: block;font-size: 18px;font-weight: 600;padding-bottom: 6px;">Deliver To.</span>
                                                                                        <span style="display: block;width: 100%;font-size: 16px;font-weight: 500;letter-spacing: 1.1px;">${orderData.createdBy.name} ${orderData.addressId.floor_no} ${orderData.addressId.building_name}, ${orderData.addressId.city}, ${orderData.addressId.state}, ${orderData.addressId.country}-${orderData.addressId.pincode}</span>
                                                                                        <span style="display: block;width: 100%;font-size: 16px;font-weight: 600;padding-top: 5px;">${orderData.createdBy.mobile}</span>
                                                                                        </td>
                                                                                        <td width="70%" style="vertical-align: top;padding: 0;border:2px solid black;" rowspan="2">
                                                                                        <table style="width: 100%;border-spacing: 0;">
                                                                                            <tbody>
                                                                                            <tr>
                                                                                                <td style="padding: 0;overflow: hidden;padding-bottom: 15px;">
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" style="width:100%;margin-left:-48px;overflow: visible;" height="48" viewBox="0 0 592 48" fill="none"> <rect style="width:684px" height="48" fill="black"/> <path d="M21.774 23.718C21.774 22.494 22.05 21.396 22.602 20.424C23.154 19.44 23.904 18.672 24.852 18.12C25.812 17.568 26.874 17.292 28.038 17.292C29.406 17.292 30.6 17.622 31.62 18.282C32.64 18.942 33.384 19.878 33.852 21.09H31.89C31.542 20.334 31.038 19.752 30.378 19.344C29.73 18.936 28.95 18.732 28.038 18.732C27.162 18.732 26.376 18.936 25.68 19.344C24.984 19.752 24.438 20.334 24.042 21.09C23.646 21.834 23.448 22.71 23.448 23.718C23.448 24.714 23.646 25.59 24.042 26.346C24.438 27.09 24.984 27.666 25.68 28.074C26.376 28.482 27.162 28.686 28.038 28.686C28.95 28.686 29.73 28.488 30.378 28.092C31.038 27.684 31.542 27.102 31.89 26.346H33.852C33.384 27.546 32.64 28.476 31.62 29.136C30.6 29.784 29.406 30.108 28.038 30.108C26.874 30.108 25.812 29.838 24.852 29.298C23.904 28.746 23.154 27.984 22.602 27.012C22.05 26.04 21.774 24.942 21.774 23.718ZM41.9783 30.126C40.8143 30.126 39.7523 29.856 38.7923 29.316C37.8323 28.764 37.0703 28.002 36.5063 27.03C35.9543 26.046 35.6783 24.942 35.6783 23.718C35.6783 22.494 35.9543 21.396 36.5063 20.424C37.0703 19.44 37.8323 18.678 38.7923 18.138C39.7523 17.586 40.8143 17.31 41.9783 17.31C43.1543 17.31 44.2223 17.586 45.1823 18.138C46.1423 18.678 46.8983 19.434 47.4503 20.406C48.0023 21.378 48.2783 22.482 48.2783 23.718C48.2783 24.954 48.0023 26.058 47.4503 27.03C46.8983 28.002 46.1423 28.764 45.1823 29.316C44.2223 29.856 43.1543 30.126 41.9783 30.126ZM41.9783 28.704C42.8543 28.704 43.6403 28.5 44.3363 28.092C45.0443 27.684 45.5963 27.102 45.9923 26.346C46.4003 25.59 46.6043 24.714 46.6043 23.718C46.6043 22.71 46.4003 21.834 45.9923 21.09C45.5963 20.334 45.0503 19.752 44.3543 19.344C43.6583 18.936 42.8663 18.732 41.9783 18.732C41.0903 18.732 40.2983 18.936 39.6023 19.344C38.9063 19.752 38.3543 20.334 37.9463 21.09C37.5503 21.834 37.3523 22.71 37.3523 23.718C37.3523 24.714 37.5503 25.59 37.9463 26.346C38.3543 27.102 38.9063 27.684 39.6023 28.092C40.3103 28.5 41.1023 28.704 41.9783 28.704ZM54.3467 17.454C55.7147 17.454 56.8967 17.712 57.8927 18.228C58.9007 18.732 59.6687 19.458 60.1967 20.406C60.7367 21.354 61.0067 22.47 61.0067 23.754C61.0067 25.038 60.7367 26.154 60.1967 27.102C59.6687 28.038 58.9007 28.758 57.8927 29.262C56.8967 29.754 55.7147 30 54.3467 30H50.4407V17.454H54.3467ZM54.3467 28.65C55.9667 28.65 57.2027 28.224 58.0547 27.372C58.9067 26.508 59.3327 25.302 59.3327 23.754C59.3327 22.194 58.9007 20.976 58.0367 20.1C57.1847 19.224 55.9547 18.786 54.3467 18.786H52.0787V28.65H54.3467ZM68.4881 30.108C68.1761 30.108 67.9121 30 67.6961 29.784C67.4801 29.568 67.3721 29.304 67.3721 28.992C67.3721 28.68 67.4801 28.416 67.6961 28.2C67.9121 27.984 68.1761 27.876 68.4881 27.876C68.7881 27.876 69.0401 27.984 69.2441 28.2C69.4601 28.416 69.5681 28.68 69.5681 28.992C69.5681 29.304 69.4601 29.568 69.2441 29.784C69.0401 30 68.7881 30.108 68.4881 30.108ZM68.4881 22.404C68.1761 22.404 67.9121 22.296 67.6961 22.08C67.4801 21.864 67.3721 21.6 67.3721 21.288C67.3721 20.976 67.4801 20.712 67.6961 20.496C67.9121 20.28 68.1761 20.172 68.4881 20.172C68.7881 20.172 69.0401 20.28 69.2441 20.496C69.4601 20.712 69.5681 20.976 69.5681 21.288C69.5681 21.6 69.4601 21.864 69.2441 22.08C69.0401 22.296 68.7881 22.404 68.4881 22.404ZM75.9849 23.718C75.9849 22.494 76.2609 21.396 76.8129 20.424C77.3649 19.44 78.1149 18.672 79.0629 18.12C80.0229 17.568 81.0849 17.292 82.2489 17.292C83.6169 17.292 84.8109 17.622 85.8309 18.282C86.8509 18.942 87.5949 19.878 88.0629 21.09H86.1009C85.7529 20.334 85.2489 19.752 84.5889 19.344C83.9409 18.936 83.1609 18.732 82.2489 18.732C81.3729 18.732 80.5869 18.936 79.8909 19.344C79.1949 19.752 78.6489 20.334 78.2529 21.09C77.8569 21.834 77.6589 22.71 77.6589 23.718C77.6589 24.714 77.8569 25.59 78.2529 26.346C78.6489 27.09 79.1949 27.666 79.8909 28.074C80.5869 28.482 81.3729 28.686 82.2489 28.686C83.1609 28.686 83.9409 28.488 84.5889 28.092C85.2489 27.684 85.7529 27.102 86.1009 26.346H88.0629C87.5949 27.546 86.8509 28.476 85.8309 29.136C84.8109 29.784 83.6169 30.108 82.2489 30.108C81.0849 30.108 80.0229 29.838 79.0629 29.298C78.1149 28.746 77.3649 27.984 76.8129 27.012C76.2609 26.04 75.9849 24.942 75.9849 23.718ZM95.3972 19.956C96.1412 19.956 96.8132 20.118 97.4132 20.442C98.0132 20.754 98.4812 21.228 98.8172 21.864C99.1652 22.5 99.3392 23.274 99.3392 24.186V30H97.7192V24.42C97.7192 23.436 97.4732 22.686 96.9812 22.17C96.4892 21.642 95.8172 21.378 94.9652 21.378C94.1012 21.378 93.4112 21.648 92.8952 22.188C92.3912 22.728 92.1392 23.514 92.1392 24.546V30H90.5012V16.68H92.1392V21.54C92.4632 21.036 92.9072 20.646 93.4712 20.37C94.0472 20.094 94.6892 19.956 95.3972 19.956ZM111.015 24.69C111.015 25.002 110.997 25.332 110.961 25.68H103.077C103.137 26.652 103.467 27.414 104.067 27.966C104.679 28.506 105.417 28.776 106.281 28.776C106.989 28.776 107.577 28.614 108.045 28.29C108.525 27.954 108.861 27.51 109.053 26.958H110.817C110.553 27.906 110.025 28.68 109.233 29.28C108.441 29.868 107.457 30.162 106.281 30.162C105.345 30.162 104.505 29.952 103.761 29.532C103.029 29.112 102.453 28.518 102.033 27.75C101.613 26.97 101.403 26.07 101.403 25.05C101.403 24.03 101.607 23.136 102.015 22.368C102.423 21.6 102.993 21.012 103.725 20.604C104.469 20.184 105.321 19.974 106.281 19.974C107.217 19.974 108.045 20.178 108.765 20.586C109.485 20.994 110.037 21.558 110.421 22.278C110.817 22.986 111.015 23.79 111.015 24.69ZM109.323 24.348C109.323 23.724 109.185 23.19 108.909 22.746C108.633 22.29 108.255 21.948 107.775 21.72C107.307 21.48 106.785 21.36 106.209 21.36C105.381 21.36 104.673 21.624 104.085 22.152C103.509 22.68 103.179 23.412 103.095 24.348H109.323ZM112.565 25.05C112.565 24.03 112.769 23.142 113.177 22.386C113.585 21.618 114.149 21.024 114.869 20.604C115.601 20.184 116.435 19.974 117.371 19.974C118.583 19.974 119.579 20.268 120.359 20.856C121.151 21.444 121.673 22.26 121.925 23.304H120.161C119.993 22.704 119.663 22.23 119.171 21.882C118.691 21.534 118.091 21.36 117.371 21.36C116.435 21.36 115.679 21.684 115.103 22.332C114.527 22.968 114.239 23.874 114.239 25.05C114.239 26.238 114.527 27.156 115.103 27.804C115.679 28.452 116.435 28.776 117.371 28.776C118.091 28.776 118.691 28.608 119.171 28.272C119.651 27.936 119.981 27.456 120.161 26.832H121.925C121.661 27.84 121.133 28.65 120.341 29.262C119.549 29.862 118.559 30.162 117.371 30.162C116.435 30.162 115.601 29.952 114.869 29.532C114.149 29.112 113.585 28.518 113.177 27.75C112.769 26.982 112.565 26.082 112.565 25.05ZM129.619 30L125.749 25.644V30H124.111V16.68H125.749V24.51L129.547 20.136H131.833L127.189 25.05L131.851 30H129.619ZM140.171 21.486V27.3C140.171 27.78 140.273 28.122 140.477 28.326C140.681 28.518 141.035 28.614 141.539 28.614H142.745V30H141.269C140.357 30 139.673 29.79 139.217 29.37C138.761 28.95 138.533 28.26 138.533 27.3V21.486H137.255V20.136H138.533V17.652H140.171V20.136H142.745V21.486H140.171ZM149.626 19.956C150.37 19.956 151.042 20.118 151.642 20.442C152.242 20.754 152.71 21.228 153.046 21.864C153.394 22.5 153.568 23.274 153.568 24.186V30H151.948V24.42C151.948 23.436 151.702 22.686 151.21 22.17C150.718 21.642 150.046 21.378 149.194 21.378C148.33 21.378 147.64 21.648 147.124 22.188C146.62 22.728 146.368 23.514 146.368 24.546V30H144.73V16.68H146.368V21.54C146.692 21.036 147.136 20.646 147.7 20.37C148.276 20.094 148.918 19.956 149.626 19.956ZM165.243 24.69C165.243 25.002 165.225 25.332 165.189 25.68H157.305C157.365 26.652 157.695 27.414 158.295 27.966C158.907 28.506 159.645 28.776 160.509 28.776C161.217 28.776 161.805 28.614 162.273 28.29C162.753 27.954 163.089 27.51 163.281 26.958H165.045C164.781 27.906 164.253 28.68 163.461 29.28C162.669 29.868 161.685 30.162 160.509 30.162C159.573 30.162 158.733 29.952 157.989 29.532C157.257 29.112 156.681 28.518 156.261 27.75C155.841 26.97 155.631 26.07 155.631 25.05C155.631 24.03 155.835 23.136 156.243 22.368C156.651 21.6 157.221 21.012 157.953 20.604C158.697 20.184 159.549 19.974 160.509 19.974C161.445 19.974 162.273 20.178 162.993 20.586C163.713 20.994 164.265 21.558 164.649 22.278C165.045 22.986 165.243 23.79 165.243 24.69ZM163.551 24.348C163.551 23.724 163.413 23.19 163.137 22.746C162.861 22.29 162.483 21.948 162.003 21.72C161.535 21.48 161.013 21.36 160.437 21.36C159.609 21.36 158.901 21.624 158.313 22.152C157.737 22.68 157.407 23.412 157.323 24.348H163.551ZM173.842 21.954C174.166 21.39 174.646 20.922 175.282 20.55C175.93 20.166 176.68 19.974 177.532 19.974C178.408 19.974 179.2 20.184 179.908 20.604C180.628 21.024 181.192 21.618 181.6 22.386C182.008 23.142 182.212 24.024 182.212 25.032C182.212 26.028 182.008 26.916 181.6 27.696C181.192 28.476 180.628 29.082 179.908 29.514C179.2 29.946 178.408 30.162 177.532 30.162C176.692 30.162 175.948 29.976 175.3 29.604C174.664 29.22 174.178 28.746 173.842 28.182V34.68H172.204V20.136H173.842V21.954ZM180.538 25.032C180.538 24.288 180.388 23.64 180.088 23.088C179.788 22.536 179.38 22.116 178.864 21.828C178.36 21.54 177.802 21.396 177.19 21.396C176.59 21.396 176.032 21.546 175.516 21.846C175.012 22.134 174.604 22.56 174.292 23.124C173.992 23.676 173.842 24.318 173.842 25.05C173.842 25.794 173.992 26.448 174.292 27.012C174.604 27.564 175.012 27.99 175.516 28.29C176.032 28.578 176.59 28.722 177.19 28.722C177.802 28.722 178.36 28.578 178.864 28.29C179.38 27.99 179.788 27.564 180.088 27.012C180.388 26.448 180.538 25.788 180.538 25.032ZM183.756 25.032C183.756 24.024 183.96 23.142 184.368 22.386C184.776 21.618 185.334 21.024 186.042 20.604C186.762 20.184 187.56 19.974 188.436 19.974C189.3 19.974 190.05 20.16 190.686 20.532C191.322 20.904 191.796 21.372 192.108 21.936V20.136H193.764V30H192.108V28.164C191.784 28.74 191.298 29.22 190.65 29.604C190.014 29.976 189.27 30.162 188.418 30.162C187.542 30.162 186.75 29.946 186.042 29.514C185.334 29.082 184.776 28.476 184.368 27.696C183.96 26.916 183.756 26.028 183.756 25.032ZM192.108 25.05C192.108 24.306 191.958 23.658 191.658 23.106C191.358 22.554 190.95 22.134 190.434 21.846C189.93 21.546 189.372 21.396 188.76 21.396C188.148 21.396 187.59 21.54 187.086 21.828C186.582 22.116 186.18 22.536 185.88 23.088C185.58 23.64 185.43 24.288 185.43 25.032C185.43 25.788 185.58 26.448 185.88 27.012C186.18 27.564 186.582 27.99 187.086 28.29C187.59 28.578 188.148 28.722 188.76 28.722C189.372 28.722 189.93 28.578 190.434 28.29C190.95 27.99 191.358 27.564 191.658 27.012C191.958 26.448 192.108 25.794 192.108 25.05ZM205.028 20.136L199.088 34.644H197.396L199.34 29.892L195.362 20.136H197.18L200.276 28.128L203.336 20.136H205.028ZM206.063 25.032C206.063 24.024 206.267 23.142 206.675 22.386C207.083 21.618 207.641 21.024 208.349 20.604C209.069 20.184 209.867 19.974 210.743 19.974C211.607 19.974 212.357 20.16 212.993 20.532C213.629 20.904 214.103 21.372 214.415 21.936V20.136H216.071V30H214.415V28.164C214.091 28.74 213.605 29.22 212.957 29.604C212.321 29.976 211.577 30.162 210.725 30.162C209.849 30.162 209.057 29.946 208.349 29.514C207.641 29.082 207.083 28.476 206.675 27.696C206.267 26.916 206.063 26.028 206.063 25.032ZM214.415 25.05C214.415 24.306 214.265 23.658 213.965 23.106C213.665 22.554 213.257 22.134 212.741 21.846C212.237 21.546 211.679 21.396 211.067 21.396C210.455 21.396 209.897 21.54 209.393 21.828C208.889 22.116 208.487 22.536 208.187 23.088C207.887 23.64 207.737 24.288 207.737 25.032C207.737 25.788 207.887 26.448 208.187 27.012C208.487 27.564 208.889 27.99 209.393 28.29C209.897 28.578 210.455 28.722 211.067 28.722C211.679 28.722 212.237 28.578 212.741 28.29C213.257 27.99 213.665 27.564 213.965 27.012C214.265 26.448 214.415 25.794 214.415 25.05ZM220.477 21.972C220.813 21.384 221.305 20.904 221.953 20.532C222.601 20.16 223.339 19.974 224.167 19.974C225.055 19.974 225.853 20.184 226.561 20.604C227.269 21.024 227.827 21.618 228.235 22.386C228.643 23.142 228.847 24.024 228.847 25.032C228.847 26.028 228.643 26.916 228.235 27.696C227.827 28.476 227.263 29.082 226.543 29.514C225.835 29.946 225.043 30.162 224.167 30.162C223.315 30.162 222.565 29.976 221.917 29.604C221.281 29.232 220.801 28.758 220.477 28.182V30H218.839V16.68H220.477V21.972ZM227.173 25.032C227.173 24.288 227.023 23.64 226.723 23.088C226.423 22.536 226.015 22.116 225.499 21.828C224.995 21.54 224.437 21.396 223.825 21.396C223.225 21.396 222.667 21.546 222.151 21.846C221.647 22.134 221.239 22.56 220.927 23.124C220.627 23.676 220.477 24.318 220.477 25.05C220.477 25.794 220.627 26.448 220.927 27.012C221.239 27.564 221.647 27.99 222.151 28.29C222.667 28.578 223.225 28.722 223.825 28.722C224.437 28.722 224.995 28.578 225.499 28.29C226.015 27.99 226.423 27.564 226.723 27.012C227.023 26.448 227.173 25.788 227.173 25.032ZM232.641 16.68V30H231.003V16.68H232.641ZM244.433 24.69C244.433 25.002 244.415 25.332 244.379 25.68H236.495C236.555 26.652 236.885 27.414 237.485 27.966C238.097 28.506 238.835 28.776 239.699 28.776C240.407 28.776 240.995 28.614 241.463 28.29C241.943 27.954 242.279 27.51 242.471 26.958H244.235C243.971 27.906 243.443 28.68 242.651 29.28C241.859 29.868 240.875 30.162 239.699 30.162C238.763 30.162 237.923 29.952 237.179 29.532C236.447 29.112 235.871 28.518 235.451 27.75C235.031 26.97 234.821 26.07 234.821 25.05C234.821 24.03 235.025 23.136 235.433 22.368C235.841 21.6 236.411 21.012 237.143 20.604C237.887 20.184 238.739 19.974 239.699 19.974C240.635 19.974 241.463 20.178 242.183 20.586C242.903 20.994 243.455 21.558 243.839 22.278C244.235 22.986 244.433 23.79 244.433 24.69ZM242.741 24.348C242.741 23.724 242.603 23.19 242.327 22.746C242.051 22.29 241.673 21.948 241.193 21.72C240.725 21.48 240.203 21.36 239.627 21.36C238.799 21.36 238.091 21.624 237.503 22.152C236.927 22.68 236.597 23.412 236.513 24.348H242.741ZM250.782 25.032C250.782 24.024 250.986 23.142 251.394 22.386C251.802 21.618 252.36 21.024 253.068 20.604C253.788 20.184 254.586 19.974 255.462 19.974C256.326 19.974 257.076 20.16 257.712 20.532C258.348 20.904 258.822 21.372 259.134 21.936V20.136H260.79V30H259.134V28.164C258.81 28.74 258.324 29.22 257.676 29.604C257.04 29.976 256.296 30.162 255.444 30.162C254.568 30.162 253.776 29.946 253.068 29.514C252.36 29.082 251.802 28.476 251.394 27.696C250.986 26.916 250.782 26.028 250.782 25.032ZM259.134 25.05C259.134 24.306 258.984 23.658 258.684 23.106C258.384 22.554 257.976 22.134 257.46 21.846C256.956 21.546 256.398 21.396 255.786 21.396C255.174 21.396 254.616 21.54 254.112 21.828C253.608 22.116 253.206 22.536 252.906 23.088C252.606 23.64 252.456 24.288 252.456 25.032C252.456 25.788 252.606 26.448 252.906 27.012C253.206 27.564 253.608 27.99 254.112 28.29C254.616 28.578 255.174 28.722 255.786 28.722C256.398 28.722 256.956 28.578 257.46 28.29C257.976 27.99 258.384 27.564 258.684 27.012C258.984 26.448 259.134 25.794 259.134 25.05ZM275.42 19.956C276.188 19.956 276.872 20.118 277.472 20.442C278.072 20.754 278.546 21.228 278.894 21.864C279.242 22.5 279.416 23.274 279.416 24.186V30H277.796V24.42C277.796 23.436 277.55 22.686 277.058 22.17C276.578 21.642 275.924 21.378 275.096 21.378C274.244 21.378 273.566 21.654 273.062 22.206C272.558 22.746 272.306 23.532 272.306 24.564V30H270.686V24.42C270.686 23.436 270.44 22.686 269.948 22.17C269.468 21.642 268.814 21.378 267.986 21.378C267.134 21.378 266.456 21.654 265.952 22.206C265.448 22.746 265.196 23.532 265.196 24.564V30H263.558V20.136H265.196V21.558C265.52 21.042 265.952 20.646 266.492 20.37C267.044 20.094 267.65 19.956 268.31 19.956C269.138 19.956 269.87 20.142 270.506 20.514C271.142 20.886 271.616 21.432 271.928 22.152C272.204 21.456 272.66 20.916 273.296 20.532C273.932 20.148 274.64 19.956 275.42 19.956ZM286.405 30.162C285.481 30.162 284.641 29.952 283.885 29.532C283.141 29.112 282.553 28.518 282.121 27.75C281.701 26.97 281.491 26.07 281.491 25.05C281.491 24.042 281.707 23.154 282.139 22.386C282.583 21.606 283.183 21.012 283.939 20.604C284.695 20.184 285.541 19.974 286.477 19.974C287.413 19.974 288.259 20.184 289.015 20.604C289.771 21.012 290.365 21.6 290.797 22.368C291.241 23.136 291.463 24.03 291.463 25.05C291.463 26.07 291.235 26.97 290.779 27.75C290.335 28.518 289.729 29.112 288.961 29.532C288.193 29.952 287.341 30.162 286.405 30.162ZM286.405 28.722C286.993 28.722 287.545 28.584 288.061 28.308C288.577 28.032 288.991 27.618 289.303 27.066C289.627 26.514 289.789 25.842 289.789 25.05C289.789 24.258 289.633 23.586 289.321 23.034C289.009 22.482 288.601 22.074 288.097 21.81C287.593 21.534 287.047 21.396 286.459 21.396C285.859 21.396 285.307 21.534 284.803 21.81C284.311 22.074 283.915 22.482 283.615 23.034C283.315 23.586 283.165 24.258 283.165 25.05C283.165 25.854 283.309 26.532 283.597 27.084C283.897 27.636 284.293 28.05 284.785 28.326C285.277 28.59 285.817 28.722 286.405 28.722ZM302.364 20.136V30H300.726V28.542C300.414 29.046 299.976 29.442 299.412 29.73C298.86 30.006 298.248 30.144 297.576 30.144C296.808 30.144 296.118 29.988 295.506 29.676C294.894 29.352 294.408 28.872 294.048 28.236C293.7 27.6 293.526 26.826 293.526 25.914V20.136H295.146V25.698C295.146 26.67 295.392 27.42 295.884 27.948C296.376 28.464 297.048 28.722 297.9 28.722C298.776 28.722 299.466 28.452 299.97 27.912C300.474 27.372 300.726 26.586 300.726 25.554V20.136H302.364ZM309.936 19.956C311.136 19.956 312.108 20.322 312.852 21.054C313.596 21.774 313.968 22.818 313.968 24.186V30H312.348V24.42C312.348 23.436 312.102 22.686 311.61 22.17C311.118 21.642 310.446 21.378 309.594 21.378C308.73 21.378 308.04 21.648 307.524 22.188C307.02 22.728 306.768 23.514 306.768 24.546V30H305.13V20.136H306.768V21.54C307.092 21.036 307.53 20.646 308.082 20.37C308.646 20.094 309.264 19.956 309.936 19.956ZM318.642 21.486V27.3C318.642 27.78 318.744 28.122 318.948 28.326C319.152 28.518 319.506 28.614 320.01 28.614H321.216V30H319.74C318.828 30 318.144 29.79 317.688 29.37C317.232 28.95 317.004 28.26 317.004 27.3V21.486H315.726V20.136H317.004V17.652H318.642V20.136H321.216V21.486H318.642ZM332.301 30.162C331.377 30.162 330.537 29.952 329.781 29.532C329.037 29.112 328.449 28.518 328.017 27.75C327.597 26.97 327.387 26.07 327.387 25.05C327.387 24.042 327.603 23.154 328.035 22.386C328.479 21.606 329.079 21.012 329.835 20.604C330.591 20.184 331.437 19.974 332.373 19.974C333.309 19.974 334.155 20.184 334.911 20.604C335.667 21.012 336.261 21.6 336.693 22.368C337.137 23.136 337.359 24.03 337.359 25.05C337.359 26.07 337.131 26.97 336.675 27.75C336.231 28.518 335.625 29.112 334.857 29.532C334.089 29.952 333.237 30.162 332.301 30.162ZM332.301 28.722C332.889 28.722 333.441 28.584 333.957 28.308C334.473 28.032 334.887 27.618 335.199 27.066C335.523 26.514 335.685 25.842 335.685 25.05C335.685 24.258 335.529 23.586 335.217 23.034C334.905 22.482 334.497 22.074 333.993 21.81C333.489 21.534 332.943 21.396 332.355 21.396C331.755 21.396 331.203 21.534 330.699 21.81C330.207 22.074 329.811 22.482 329.511 23.034C329.211 23.586 329.061 24.258 329.061 25.05C329.061 25.854 329.205 26.532 329.493 27.084C329.793 27.636 330.189 28.05 330.681 28.326C331.173 28.59 331.713 28.722 332.301 28.722ZM344.319 19.956C345.519 19.956 346.491 20.322 347.235 21.054C347.979 21.774 348.351 22.818 348.351 24.186V30H346.731V24.42C346.731 23.436 346.485 22.686 345.993 22.17C345.501 21.642 344.829 21.378 343.977 21.378C343.113 21.378 342.423 21.648 341.907 22.188C341.403 22.728 341.151 23.514 341.151 24.546V30H339.513V20.136H341.151V21.54C341.475 21.036 341.913 20.646 342.465 20.37C343.029 20.094 343.647 19.956 344.319 19.956ZM357.823 21.486V27.3C357.823 27.78 357.925 28.122 358.129 28.326C358.333 28.518 358.687 28.614 359.191 28.614H360.397V30H358.921C358.009 30 357.325 29.79 356.869 29.37C356.413 28.95 356.185 28.26 356.185 27.3V21.486H354.907V20.136H356.185V17.652H357.823V20.136H360.397V21.486H357.823ZM367.278 19.956C368.022 19.956 368.694 20.118 369.294 20.442C369.894 20.754 370.362 21.228 370.698 21.864C371.046 22.5 371.22 23.274 371.22 24.186V30H369.6V24.42C369.6 23.436 369.354 22.686 368.862 22.17C368.37 21.642 367.698 21.378 366.846 21.378C365.982 21.378 365.292 21.648 364.776 22.188C364.272 22.728 364.02 23.514 364.02 24.546V30H362.382V16.68H364.02V21.54C364.344 21.036 364.788 20.646 365.352 20.37C365.928 20.094 366.57 19.956 367.278 19.956ZM382.896 24.69C382.896 25.002 382.878 25.332 382.842 25.68H374.958C375.018 26.652 375.348 27.414 375.948 27.966C376.56 28.506 377.298 28.776 378.162 28.776C378.87 28.776 379.458 28.614 379.926 28.29C380.406 27.954 380.742 27.51 380.934 26.958H382.698C382.434 27.906 381.906 28.68 381.114 29.28C380.322 29.868 379.338 30.162 378.162 30.162C377.226 30.162 376.386 29.952 375.642 29.532C374.91 29.112 374.334 28.518 373.914 27.75C373.494 26.97 373.284 26.07 373.284 25.05C373.284 24.03 373.488 23.136 373.896 22.368C374.304 21.6 374.874 21.012 375.606 20.604C376.35 20.184 377.202 19.974 378.162 19.974C379.098 19.974 379.926 20.178 380.646 20.586C381.366 20.994 381.918 21.558 382.302 22.278C382.698 22.986 382.896 23.79 382.896 24.69ZM381.204 24.348C381.204 23.724 381.066 23.19 380.79 22.746C380.514 22.29 380.136 21.948 379.656 21.72C379.188 21.48 378.666 21.36 378.09 21.36C377.262 21.36 376.554 21.624 375.966 22.152C375.39 22.68 375.06 23.412 374.976 24.348H381.204ZM389.245 25.032C389.245 24.024 389.449 23.142 389.857 22.386C390.265 21.618 390.823 21.024 391.531 20.604C392.251 20.184 393.049 19.974 393.925 19.974C394.789 19.974 395.539 20.16 396.175 20.532C396.811 20.904 397.285 21.372 397.597 21.936V20.136H399.253V30H397.597V28.164C397.273 28.74 396.787 29.22 396.139 29.604C395.503 29.976 394.759 30.162 393.907 30.162C393.031 30.162 392.239 29.946 391.531 29.514C390.823 29.082 390.265 28.476 389.857 27.696C389.449 26.916 389.245 26.028 389.245 25.032ZM397.597 25.05C397.597 24.306 397.447 23.658 397.147 23.106C396.847 22.554 396.439 22.134 395.923 21.846C395.419 21.546 394.861 21.396 394.249 21.396C393.637 21.396 393.079 21.54 392.575 21.828C392.071 22.116 391.669 22.536 391.369 23.088C391.069 23.64 390.919 24.288 390.919 25.032C390.919 25.788 391.069 26.448 391.369 27.012C391.669 27.564 392.071 27.99 392.575 28.29C393.079 28.578 393.637 28.722 394.249 28.722C394.861 28.722 395.419 28.578 395.923 28.29C396.439 27.99 396.847 27.564 397.147 27.012C397.447 26.448 397.597 25.794 397.597 25.05ZM403.659 21.954C403.983 21.39 404.463 20.922 405.099 20.55C405.747 20.166 406.497 19.974 407.349 19.974C408.225 19.974 409.017 20.184 409.725 20.604C410.445 21.024 411.009 21.618 411.417 22.386C411.825 23.142 412.029 24.024 412.029 25.032C412.029 26.028 411.825 26.916 411.417 27.696C411.009 28.476 410.445 29.082 409.725 29.514C409.017 29.946 408.225 30.162 407.349 30.162C406.509 30.162 405.765 29.976 405.117 29.604C404.481 29.22 403.995 28.746 403.659 28.182V34.68H402.021V20.136H403.659V21.954ZM410.355 25.032C410.355 24.288 410.205 23.64 409.905 23.088C409.605 22.536 409.197 22.116 408.681 21.828C408.177 21.54 407.619 21.396 407.007 21.396C406.407 21.396 405.849 21.546 405.333 21.846C404.829 22.134 404.421 22.56 404.109 23.124C403.809 23.676 403.659 24.318 403.659 25.05C403.659 25.794 403.809 26.448 404.109 27.012C404.421 27.564 404.829 27.99 405.333 28.29C405.849 28.578 406.407 28.722 407.007 28.722C407.619 28.722 408.177 28.578 408.681 28.29C409.197 27.99 409.605 27.564 409.905 27.012C410.205 26.448 410.355 25.788 410.355 25.032ZM415.823 21.954C416.147 21.39 416.627 20.922 417.263 20.55C417.911 20.166 418.661 19.974 419.513 19.974C420.389 19.974 421.181 20.184 421.889 20.604C422.609 21.024 423.173 21.618 423.581 22.386C423.989 23.142 424.193 24.024 424.193 25.032C424.193 26.028 423.989 26.916 423.581 27.696C423.173 28.476 422.609 29.082 421.889 29.514C421.181 29.946 420.389 30.162 419.513 30.162C418.673 30.162 417.929 29.976 417.281 29.604C416.645 29.22 416.159 28.746 415.823 28.182V34.68H414.185V20.136H415.823V21.954ZM422.519 25.032C422.519 24.288 422.369 23.64 422.069 23.088C421.769 22.536 421.361 22.116 420.845 21.828C420.341 21.54 419.783 21.396 419.171 21.396C418.571 21.396 418.013 21.546 417.497 21.846C416.993 22.134 416.585 22.56 416.273 23.124C415.973 23.676 415.823 24.318 415.823 25.05C415.823 25.794 415.973 26.448 416.273 27.012C416.585 27.564 416.993 27.99 417.497 28.29C418.013 28.578 418.571 28.722 419.171 28.722C419.783 28.722 420.341 28.578 420.845 28.29C421.361 27.99 421.769 27.564 422.069 27.012C422.369 26.448 422.519 25.788 422.519 25.032Z" fill="white"/> </svg>
                                                                                                </td>
                                                                                            </tr>
                                                                                            <tr>
                                                                                                <td style="padding: 16px;padding-top: 0;">
                                                                                                <table style="width: 100%;border-spacing: 0;">
                                                                                                    <tr>
                                                                                                    <td style="font-size: 14px;font-weight: 500;"><span style="font-weight: 600;">Order No : </span>${orderData.orderId}</td>
                                                                                                    <td rowspan="5" style="text-align: -webkit-right; padding: 0;">
                                                                                                        <div style="width: 200px;height: 200px;">
                                                                                                        <img src="${orderData.QRcode}" style="width: 100%;"></img>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                    <td style="font-size: 14px;font-weight: 500;"><span style="font-weight: 600;">Order Date : </span>${orderDate}</td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                    <td style="font-size: 14px;font-weight: 500;"><span style="font-weight: 600;">Invoice No : </span>${orderData.invoiceNo}</td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                    <td style="font-size: 14px;font-weight: 500;"><span style="font-weight: 600;">Invoice Date : </span>${currentdate}</td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                    <td style="font-size: 14px;font-weight: 500;"><span style="font-weight: 600;">GSTIN : </span> ${invoiceSettingsData.gst_no}</td>
                                                                                                    </tr>
                                                                                                </table>
                                                                                                </td>
                                                                                            </tr>
                                                                                            </tbody>
                                                                                        </table>
                                                                                        </td>
                                                                                    </tr>
                                                                                    <tr>
                                                                                        <td style="padding: 10px;border:2px solid black;">
                                                                                        <span style="display: block;font-size: 18px;font-weight: 600;padding-bottom: 6px;">Deliver From.</span>
                                                                                        <span style="display: block;width: 100%;font-size: 16px;font-weight: 500;letter-spacing: 1.1px;">${invoiceSettingsData.company_name} ${invoiceSettingsData.company_address} ${invoiceSettingsData.support_email}</span>
                                                                                        <span style="display: block;width: 100%;font-size: 16px;font-weight: 600;padding-top: 5px;">${invoiceSettingsData.support_mobile_no}</span>
                                                                                        </td>
                                                                                    </tr>
                                                                                    </tbody>
                                                                                </table>
                                                                                </td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td>
                                                                                <table style="width: 100%;border-spacing: 0;">
                                                                                    <tbody>
                                                                                    <tr>
                                                                                        <td width="300px"><span style="display: block;border: 1px dashed black;"></span></td>
                                                                                        <td width="70px"><span style="display: block;text-align: center;font-size: 14px;font-weight: 600;letter-spacing: 0.1em;">Fold Here</span></td>
                                                                                        <td width="300px"><span style="display: block;border: 1px dashed black;"></span></td>
                                                                                    </tr>
                                                                                    </tbody>
                                                                                </table>
                                                                                </td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td colspan="6">
                                                                                <table style="border-collapse: collapse;border-spacing: 0;width: 100%;">
                                                                                    <thead>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Product Name</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">SKUID</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Size</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Qty</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Gross Amount</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Discount</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Taxable Amount</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Taxes(CGST,SGST)</th>
                                                                                    <th style="font-size: 14px;padding: 8px 10px;border:2px solid black;border-spacing: 0;text-align: left;text-wrap: nowrap;">Payable Amount</th>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                    ${veriants}
                                                                                    </tbody>
                                                                                    <tfoot>
                                                                                    <tr>
                                                                                        <td colspan="7" style="border: 2px solid black;border-spacing: 0;padding: 20px;">
                                                                                        <table style="width: 100%;border-collapse: collapse;border-spacing: 0;">
                                                                                            <tbody>
                                                                                            <tr>
                                                                                                <td style="font-weight: 600;font-size: 18px;">Payment info&nbsp;:&nbsp;</td>
                                                                                                <td rowspan="2" style="text-align: right;font-weight: 600;font-size: 18px;">Grand Total : &nbsp;&nbsp;</td>
                                                                                            </tr>
                                                                                            <tr style="">
                                                                                                <td style="font-size: 14px;color: rgba(0,0,0,0.9);letter-spacing:0.05rem;padding-top: 5px;">${orderData.payment_type} - ${orderData.createdBy.mobile}</td>
                                                                                            </tr>
                                                                                            </tbody>
                                                                                        </table>
                                                                                        </td>
                                                                                        <td colspan="1" style="font-size: 18px;font-weight: 500;padding: 6px 10px;border: 2px solid black;border-spacing: 0;">Rs. ${orderData.total_gst}</td>
                                                                                        <td colspan="1" style="font-size: 18px;font-weight: 500;padding: 6px 10px;border: 2px solid black;border-spacing: 0;">Rs. ${orderData.total_discounted_amount}</td>
                                                                                    </tr>
                                                                                    </tfoot>
                                                                                </table>
                                                                                </td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td style="padding:20px 0;">
                                                                                <div style="display: flex;align-items: center;">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="150" height="110" style="margin-left:auto;" viewBox="0 0 549 264" fill="none"> <rect width="549" height="264" fill="url(#pattern0)"/> <defs> <pattern id="pattern0" patternContentUnits="objectBoundingBox" width="1" height="1"> <use xlink:href="#image0_591_457" transform="scale(0.00182149 0.00378788)"/> </pattern> <image id="image0_591_457" width="549" height="264" xlink:href="data:image/jpeg;base64,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Zz0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL2cvaW1nLyIKICAgICAgICAgICAgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iCiAgICAgICAgICAgIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIgogICAgICAgICAgICB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIgogICAgICAgICAgICB4bWxuczpzdE1mcz0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL01hbmlmZXN0SXRlbSMiCiAgICAgICAgICAgIHhtbG5zOmlsbHVzdHJhdG9yPSJodHRwOi8vbnMuYWRvYmUuY29tL2lsbHVzdHJhdG9yLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOnBkZj0iaHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyI+CiAgICAgICAgIDxkYzpmb3JtYXQ+aW1hZ2UvanBlZzwvZGM6Zm9ybWF0PgogICAgICAgICA8ZGM6dGl0bGU+CiAgICAgICAgICAgIDxyZGY6QWx0PgogICAgICAgICAgICAgICA8cmRmOmxpIHhtbDpsYW5nPSJ4LWRlZmF1bHQiPldlYjwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpBbHQ+CiAgICAgICAgIDwvZGM6dGl0bGU+CiAgICAgICAgIDx4bXA6Q3JlYXRvclRvb2w+QWRvYmUgSWxsdXN0cmF0b3IgMjYuMCAoV2luZG93cyk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgICAgPHhtcDpDcmVhdGVEYXRlPjIwMjMtMTItMTNUMTY6MjY6MDMrMDU6MzA8L3htcDpDcmVhdGVEYXRlPgogICAgICAgICA8eG1wOk1vZGlmeURhdGU+MjAyMy0xMi0xM1QxMDo1NjowM1o8L3htcDpNb2RpZnlEYXRlPgogICAgICAgICA8eG1wOk1ldGFkYXRhRGF0ZT4yMDIzLTEyLTEzVDE2OjI2OjAzKzA1OjMwPC94bXA6TWV0YWRhdGFEYXRlPgogICAgICAgICA8eG1wOlRodW1ibmFpbHM+CiAgICAgICAgICAgIDxyZGY6QWx0PgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHhtcEdJbWc6d2lkdGg+MjU2PC94bXBHSW1nOndpZHRoPgogICAgICAgICAgICAgICAgICA8eG1wR0ltZzpoZWlnaHQ+ODQ8L3htcEdJbWc6aGVpZ2h0PgogICAgICAgICAgICAgICAgICA8eG1wR0ltZzpmb3JtYXQ+SlBFRzwveG1wR0ltZzpmb3JtYXQ+CiAgICAgICAgICAgICAgICAgIDx4bXBHSW1nOmltYWdlPi85ai80QUFRU2taSlJnQUJBZ0VBU0FCSUFBRC83UUFzVUdodmRHOXphRzl3SURNdU1BQTRRa2xOQSswQUFBQUFBQkFBU0FBQUFBRUEmI3hBO0FRQklBQUFBQVFBQi8rSU1XRWxEUTE5UVVrOUdTVXhGQUFFQkFBQU1TRXhwYm04Q0VBQUFiVzUwY2xKSFFpQllXVm9nQjg0QUFnQUomI3hBO0FBWUFNUUFBWVdOemNFMVRSbFFBQUFBQVNVVkRJSE5TUjBJQUFBQUFBQUFBQUFBQUFBQUFBUGJXQUFFQUFBQUEweTFJVUNBZ0FBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBUlkzQnlkQUFBQVZBQUFBQXomI3hBO1pHVnpZd0FBQVlRQUFBQnNkM1J3ZEFBQUFmQUFBQUFVWW10d2RBQUFBZ1FBQUFBVWNsaFpXZ0FBQWhnQUFBQVVaMWhaV2dBQUFpd0EmI3hBO0FBQVVZbGhaV2dBQUFrQUFBQUFVWkcxdVpBQUFBbFFBQUFCd1pHMWtaQUFBQXNRQUFBQ0lkblZsWkFBQUEwd0FBQUNHZG1sbGR3QUEmI3hBO0E5UUFBQUFrYkhWdGFRQUFBL2dBQUFBVWJXVmhjd0FBQkF3QUFBQWtkR1ZqYUFBQUJEQUFBQUFNY2xSU1F3QUFCRHdBQUFnTVoxUlMmI3hBO1F3QUFCRHdBQUFnTVlsUlNRd0FBQkR3QUFBZ01kR1Y0ZEFBQUFBQkRiM0I1Y21sbmFIUWdLR01wSURFNU9UZ2dTR1YzYkdWMGRDMVEmI3hBO1lXTnJZWEprSUVOdmJYQmhibmtBQUdSbGMyTUFBQUFBQUFBQUVuTlNSMElnU1VWRE5qRTVOall0TWk0eEFBQUFBQUFBQUFBQUFBQVMmI3hBO2MxSkhRaUJKUlVNMk1UazJOaTB5TGpFQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFGaFpXaUFBQUFBQUFBRHpVUUFCQUFBQUFSYk1XRmxhSUFBQUFBQUFBQUFBQUFBQUFBQUFBQUJZV1ZvZ0FBQUEmI3hBO0FBQUFiNklBQURqMUFBQURrRmhaV2lBQUFBQUFBQUJpbVFBQXQ0VUFBQmphV0ZsYUlBQUFBQUFBQUNTZ0FBQVBoQUFBdHM5a1pYTmomI3hBO0FBQUFBQUFBQUJaSlJVTWdhSFIwY0RvdkwzZDNkeTVwWldNdVkyZ0FBQUFBQUFBQUFBQUFBQlpKUlVNZ2FIUjBjRG92TDNkM2R5NXAmI3hBO1pXTXVZMmdBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBWkdWell3QUEmI3hBO0FBQUFBQUF1U1VWRElEWXhPVFkyTFRJdU1TQkVaV1poZFd4MElGSkhRaUJqYjJ4dmRYSWdjM0JoWTJVZ0xTQnpVa2RDQUFBQUFBQUEmI3hBO0FBQUFBQUF1U1VWRElEWXhPVFkyTFRJdU1TQkVaV1poZFd4MElGSkhRaUJqYjJ4dmRYSWdjM0JoWTJVZ0xTQnpVa2RDQUFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFBQUFBQUdSbGMyTUFBQUFBQUFBQUxGSmxabVZ5Wlc1alpTQldhV1YzYVc1bklFTnZibVJwZEdsdmJpQnAmI3hBO2JpQkpSVU0yTVRrMk5pMHlMakVBQUFBQUFBQUFBQUFBQUN4U1pXWmxjbVZ1WTJVZ1ZtbGxkMmx1WnlCRGIyNWthWFJwYjI0Z2FXNGcmI3hBO1NVVkROakU1TmpZdE1pNHhBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQjJhV1YzQUFBQUFBQVRwUDRBRkY4dUFCRFAmI3hBO0ZBQUQ3Y3dBQkJNTEFBTmNuZ0FBQUFGWVdWb2dBQUFBQUFCTUNWWUFVQUFBQUZjZjUyMWxZWE1BQUFBQUFBQUFBUUFBQUFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFBS1BBQUFBQW5OcFp5QUFBQUFBUTFKVUlHTjFjbllBQUFBQUFBQUVBQUFBQUFVQUNnQVBBQlFBR1FBZUFDTUEmI3hBO0tBQXRBRElBTndBN0FFQUFSUUJLQUU4QVZBQlpBRjRBWXdCb0FHMEFjZ0IzQUh3QWdRQ0dBSXNBa0FDVkFKb0Fud0NrQUtrQXJnQ3kmI3hBO0FMY0F2QURCQU1ZQXl3RFFBTlVBMndEZ0FPVUE2d0R3QVBZQSt3RUJBUWNCRFFFVEFSa0JId0VsQVNzQk1nRTRBVDRCUlFGTUFWSUImI3hBO1dRRmdBV2NCYmdGMUFYd0Jnd0dMQVpJQm1nR2hBYWtCc1FHNUFjRUJ5UUhSQWRrQjRRSHBBZklCK2dJREFnd0NGQUlkQWlZQ0x3STQmI3hBO0FrRUNTd0pVQWwwQ1p3SnhBbm9DaEFLT0FwZ0NvZ0tzQXJZQ3dRTExBdFVDNEFMckF2VURBQU1MQXhZRElRTXRBemdEUXdOUEExb0QmI3hBO1pnTnlBMzREaWdPV0E2SURyZ082QThjRDB3UGdBK3dEK1FRR0JCTUVJQVF0QkRzRVNBUlZCR01FY1FSK0JJd0VtZ1NvQkxZRXhBVFQmI3hBO0JPRUU4QVQrQlEwRkhBVXJCVG9GU1FWWUJXY0Zkd1dHQlpZRnBnVzFCY1VGMVFYbEJmWUdCZ1lXQmljR053WklCbGtHYWdaN0Jvd0cmI3hBO25RYXZCc0FHMFFiakJ2VUhCd2NaQnlzSFBRZFBCMkVIZEFlR0I1a0hyQWUvQjlJSDVRZjRDQXNJSHdneUNFWUlXZ2h1Q0lJSWxnaXEmI3hBO0NMNEkwZ2puQ1BzSkVBa2xDVG9KVHdsa0NYa0pqd21rQ2JvSnp3bmxDZnNLRVFvbkNqMEtWQXBxQ29FS21BcXVDc1VLM0FyekN3c0wmI3hBO0lnczVDMUVMYVF1QUM1Z0xzQXZJQytFTCtRd1NEQ29NUXd4Y0RIVU1qZ3luRE1BTTJRenpEUTBOSmcxQURWb05kQTJPRGFrTnd3M2UmI3hBO0RmZ09FdzR1RGtrT1pBNS9EcHNPdGc3U0R1NFBDUThsRDBFUFhnOTZENVlQc3cvUEQrd1FDUkFtRUVNUVlSQitFSnNRdVJEWEVQVVImI3hBO0V4RXhFVThSYlJHTUVhb1J5UkhvRWdjU0poSkZFbVFTaEJLakVzTVM0eE1ERXlNVFF4TmpFNE1UcEJQRkUrVVVCaFFuRkVrVWFoU0wmI3hBO0ZLMFV6aFR3RlJJVk5CVldGWGdWbXhXOUZlQVdBeFltRmtrV2JCYVBGcklXMWhiNkZ4MFhRUmRsRjRrWHJoZlNGL2NZR3hoQUdHVVkmI3hBO2loaXZHTlVZK2hrZ0dVVVpheG1SR2JjWjNSb0VHaW9hVVJwM0dwNGF4UnJzR3hRYk94dGpHNG9ic2h2YUhBSWNLaHhTSEhzY294ek0mI3hBO0hQVWRIaDFISFhBZG1SM0RIZXdlRmg1QUhtb2VsQjYrSHVrZkV4OCtIMmtmbEIrL0grb2dGU0JCSUd3Z21DREVJUEFoSENGSUlYVWgmI3hBO29TSE9JZnNpSnlKVklvSWlyeUxkSXdvak9DTm1JNVFqd2lQd0pCOGtUU1I4SktzazJpVUpKVGdsYUNXWEpjY2w5eVluSmxjbWh5YTMmI3hBO0p1Z25HQ2RKSjNvbnF5ZmNLQTBvUHloeEtLSW8xQ2tHS1RncGF5bWRLZEFxQWlvMUttZ3FteXJQS3dJck5pdHBLNTByMFN3RkxEa3MmI3hBO2JpeWlMTmN0REMxQkxYWXRxeTNoTGhZdVRDNkNMcmN1N2k4a0wxb3ZrUy9ITC80d05UQnNNS1F3MnpFU01Vb3hnakc2TWZJeUtqSmomI3hBO01wc3kxRE1OTTBZemZ6TzRNL0UwS3pSbE5KNDAyRFVUTlUwMWh6WENOZjAyTnpaeU5xNDI2VGNrTjJBM25EZlhPQlE0VURpTU9NZzUmI3hBO0JUbENPWDg1dkRuNU9qWTZkRHF5T3U4N0xUdHJPNm83NkR3blBHVThwRHpqUFNJOVlUMmhQZUErSUQ1Z1BxQSs0RDhoUDJFL29qL2kmI3hBO1FDTkFaRUNtUU9kQktVRnFRYXhCN2tJd1FuSkN0VUwzUXpwRGZVUEFSQU5FUjBTS1JNNUZFa1ZWUlpwRjNrWWlSbWRHcTBid1J6VkgmI3hBO2UwZkFTQVZJUzBpUlNOZEpIVWxqU2FsSjhFbzNTbjFLeEVzTVMxTkxta3ZpVENwTWNreTZUUUpOU2syVFRkeE9KVTV1VHJkUEFFOUomI3hBO1Q1TlAzVkFuVUhGUXUxRUdVVkJSbTFIbVVqRlNmRkxIVXhOVFgxT3FVL1pVUWxTUFZOdFZLRlYxVmNKV0QxWmNWcWxXOTFkRVY1SlgmI3hBOzRGZ3ZXSDFZeTFrYVdXbFp1Rm9IV2xaYXBscjFXMFZibFZ2bFhEVmNobHpXWFNkZGVGM0pYaHBlYkY2OVh3OWZZVit6WUFWZ1YyQ3EmI3hBO1lQeGhUMkdpWWZWaVNXS2NZdkJqUTJPWFkrdGtRR1NVWk9sbFBXV1NaZWRtUFdhU1p1aG5QV2VUWitsb1AyaVdhT3hwUTJtYWFmRnEmI3hBO1NHcWZhdmRyVDJ1bmEvOXNWMnl2YlFodFlHMjViaEp1YTI3RWJ4NXZlRy9SY0N0d2huRGdjVHB4bFhId2NrdHlwbk1CYzExenVIUVUmI3hBO2RIQjB6SFVvZFlWMTRYWStkcHQyK0hkV2Q3TjRFWGh1ZU14NUtubUplZWQ2Um5xbGV3UjdZM3ZDZkNGOGdYemhmVUY5b1g0QmZtSismI3hBO3duOGpmNFIvNVlCSGdLaUJDb0ZyZ2MyQ01JS1NndlNEVjRPNmhCMkVnSVRqaFVlRnE0WU9obktHMTRjN2g1K0lCSWhwaU02Sk00bVomI3hBO2lmNktaSXJLaXpDTGxvdjhqR09NeW8weGpaaU4vNDVtanM2UE5vK2VrQWFRYnBEV2tUK1JxSklSa25xUzQ1Tk5rN2FVSUpTS2xQU1YmI3hBO1g1WEpsalNXbjVjS2wzV1g0SmhNbUxpWkpKbVFtZnlhYUpyVm0wS2JyNXdjbkltYzk1MWtuZEtlUUo2dW54MmZpNS82b0dtZzJLRkgmI3hBO29iYWlKcUtXb3dhamRxUG1wRmFreDZVNHBhbW1HcWFMcHYybmJxZmdxRktveEtrM3FhbXFIS3FQcXdLcmRhdnByRnlzMEsxRXJiaXUmI3hBO0xhNmhyeGF2aTdBQXNIV3c2ckZnc2RheVM3TENzeml6cnJRbHRKeTFFN1dLdGdHMmViYnd0MmkzNExoWnVORzVTcm5DdWp1NnRic3UmI3hBO3U2ZThJYnlidlJXOWo3NEt2b1MrLzc5NnYvWEFjTURzd1dmQjQ4SmZ3dHZEV01QVXhGSEV6c1ZMeGNqR1JzYkR4MEhIdjhnOXlMekomI3hBO09zbTV5ampLdDhzMnk3Yk1OY3kxelRYTnRjNDJ6cmJQTjgrNDBEblF1dEU4MGI3U1A5TEIwMFRUeHRSSjFNdlZUdFhSMWxYVzJOZGMmI3hBOzErRFlaTmpvMld6WjhkcDIydnZiZ053RjNJcmRFTjJXM2h6ZW90OHAzNi9nTnVDOTRVVGh6T0pUNHR2alkrUHI1SFBrL09XRTVnM20mI3hBO2x1Y2Y1Nm5vTXVpODZVYnAwT3BiNnVYcmNPdjc3SWJ0RWUyYzdpanV0TzlBNzh6d1dQRGw4WEx4Ly9LTTh4bnpwL1EwOU1MMVVQWGUmI3hBOzltMzIrL2VLK0JuNHFQazQrY2Y2Vi9ybiszZjhCL3lZL1NuOXV2NUwvdHovYmYvLy8rNEFEa0ZrYjJKbEFHVEFBQUFBQWYvYkFJUUEmI3hBO0JnUUVCQVVFQmdVRkJna0dCUVlKQ3dnR0JnZ0xEQW9LQ3dvS0RCQU1EQXdNREF3UURBNFBFQThPREJNVEZCUVRFeHdiR3hzY0h4OGYmI3hBO0h4OGZIeDhmSHdFSEJ3Y05EQTBZRUJBWUdoVVJGUm9mSHg4Zkh4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4OGYmI3hBO0h4OGZIeDhmSHg4Zkh4OGZIeDhmLzhBQUVRZ0FWQUVBQXdFUkFBSVJBUU1SQWYvRUFhSUFBQUFIQVFFQkFRRUFBQUFBQUFBQUFBUUYmI3hBO0F3SUdBUUFIQ0FrS0N3RUFBZ0lEQVFFQkFRRUFBQUFBQUFBQUFRQUNBd1FGQmdjSUNRb0xFQUFDQVFNREFnUUNCZ2NEQkFJR0FuTUImI3hBO0FnTVJCQUFGSVJJeFFWRUdFMkVpY1lFVU1wR2hCeFd4UWlQQlV0SGhNeFppOENSeWd2RWxRelJUa3FLeVkzUENOVVFuazZPek5oZFUmI3hBO1pIVEQwdUlJSm9NSkNoZ1poSlJGUnFTMFZ0TlZLQnJ5NC9QRTFPVDBaWFdGbGFXMXhkWGw5V1oyaHBhbXRzYlc1dlkzUjFkbmQ0ZVgmI3hBO3A3ZkgxK2YzT0VoWWFIaUltS2k0eU5qbytDazVTVmxwZVltWnFibkoyZW41S2pwS1dtcDZpcHFxdXNyYTZ2b1JBQUlDQVFJREJRVUUmI3hBO0JRWUVDQU1EYlFFQUFoRURCQ0VTTVVFRlVSTmhJZ1p4Z1pFeW9iSHdGTUhSNFNOQ0ZWSmljdkV6SkRSRGdoYVNVeVdpWTdMQ0IzUFMmI3hBO05lSkVneGRVa3dnSkNoZ1pKalpGR2lka2RGVTM4cU96d3lncDArUHpoSlNrdE1UVTVQUmxkWVdWcGJYRjFlWDFSbFptZG9hV3ByYkcmI3hBOzF1YjJSMWRuZDRlWHA3ZkgxK2YzT0VoWWFIaUltS2k0eU5qbytEbEpXV2w1aVptcHVjblo2ZmtxT2twYWFucUttcXE2eXRycSt2L2EmI3hBO0FBd0RBUUFDRVFNUkFEOEE5VTRxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTcmI3hBO0ZYWXE3RlhZcTdGVUhmM3NzVWtOcGJCV3ZibmtZdWRlQ0lsUFVsY0FnbFY1S09JNnNRS2dWWVJKNk51UEdDREkvU1B3QitPbmZ5TUkmI3hBOzg2ZVo3elNQTnVqMi9ONUxlMHQvclV2eEtwbDVNeVRGMUpqalpoREcvQWJmRTIyWStYSVl5RHVOQnBJNWNFejFrYTkzZDNubVJma0cmI3hBO1Z2cjlyYVJyZVhNeVBvMTBWTnRxS1ZaRU1oQTRURVY0cVdQd3liTCt5M0VnRjd1TURmbzYwYWFVandnZnZCemorcjlJNTlSZlEyaWwmI3hBO2psalNXSjFraWtVTWpxUVZaU0tnZ2pZZ2pMSEZJSU5IbXV4UTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXEmI3hBOzdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RldDWG12YXNsbjVtMXpTN2NUWGxwZG5UK01wQldLMnNrcTBnVUJTM3h5TzFLOS93REomI3hBO29jY3pOU0k5M3lkMURUUU1zV09acU1vOFh2bExwOGdCL2E4ZnV0VjFLNjFGdFNudVpIdjJjUy9XYTBjT3BxcFVpbkhqVDRhZE8yWUomI3hBO2tTYjZ2VXd3d2pEZ0E5UGN6SHlwclY3Y0NTSFNFaVMrTWNqWDJpUzcyZW9LVm83UlJIYU9iajFSZmhZRGFpZ3FiOGNpZVh5NzNWYXomI3hBO0JHTytTK0hhcC94UTdyUFVlWjNIdjNUdnk5ckVHbVM2VnFlanRJbmx2VjV4WTMybHl2NmdzN3h0MU1iTTFRclY1SC9KNjdsUXRrSlYmI3hBO1JIMG43SEQxT0E1Qk9HVCs5Z09JU0g4VWZQOEFIUDQzMC9NdDUxMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3UmI3hBO3hWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLc0F2ckdLMzB6enRvOC9Lcm1UV0lYSVE4MG5UblJWWVBza3NCVXRTdmNVTkRtTVImI3hBO1FrUGk3dkhrTXA0TWc4b2ZMOVlOdkdNd0hyR1FlVVV1ZFAxM1N0VXVHTmxZaVJwUHJjZ0txOFVTc1pnbmQ2cUNsRnJ1YWRUbHVQWWcmI3hBO3VGclNKNHB3SHFsWEx6UEwzZC8yc3gvTDMvbllMalh5eWxJSjlRdEw5WWpSMWlwUEpPd29TdjJ4R0l5UjQ5S1pmaDlWKzkxWGFmN2cmI3hBO1krOFFsSDM3QWZwdE03N3o1K1lGcjVydGZMYStWdFBrdXI2M3VieTBsL1RFaW9ZYlNTS05pLzhBb0JLc2ZYV2czNzc1bVBOTW8wanomI3hBO0ZKZmE1cW1qeldvZ3VOS2l0SkpuV1QxRVpydEdjcXRWUTBRcFN2ZndHS3I3THpBdHo1cDFUUVJBVmJUTFd5dXpjY3FoL3JyM0NoZU4mI3hBO051SDFYclhldnRpcVhhZDUvd0JOdnZQV28rVVk0WFdld2hFaTNoSTlLV1JCRzF4Q24rVkN0ekNXL3dCYjJ4Vng4L1dFZjVndjVOdUkmI3hBO0hobWEwZ3ViVytKckZMTE1aejlXcFQ0WlBUdG5kZC9pQWJweDNWVk5XODVwcCtwNjVZbTBNaDBYUjQ5YU1nZW5xaVI3bGZTcHhQRWomI3hBOzZwOXJmN1hUYmRWWWZPeXkzbWk2ZllXVFhtcGFwRERlWFVDT0FsbFp5QUZwNTVLSDNXTmFWa1liVUFZcXFtZm1mV0o5RjBHODFhR3omI3hBO2EvTmtnbWx0WTI0dTBLTURNeWJOeVpJdVRLbFBpSTQ3VnJpcUUxTHpkYlEzUGwrMjAyTmRTbDh3eVZ0VEhKeFFXU1Irck5kOCtMQW8mI3hBO2lNbEIrMHpxSzc0cXE2MTUxOG42SGR4V2VzNjNZNmJkVGdHS0M2dVlvWFlFMERjWFlHbFIxNllxbWozdG5IOVg1enhwOWJZUjJ2SjEmI3hBO0hxdVVhUUxIVS9FZUNNMUIyQk9LdHlYVnJGTkRCSk1pVDNISVFSTXdEeUZCeWJncE5XNGpjMHhWS1BKdm1oZk11bFQ2Z3RzYlVRMzEmI3hBOzlZK21YOVN2MUc2a3R1ZGFMOXYwdVZPMWFiOWNWVHpGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZWTjdhRjU0cmgmI3hBO2wvZlFobGpjYkVLOU9TLzZwNGcwOFFQREJUSVRJQkhRb0krWE5CRXh1RTA2MWp1dVJkYmxZSXZVVnp2ekRGVDhWZDY0T0NQYzIvbXMmI3hBO3RVWlNydXMwOFQvTWpUTlMwL3pOSWwvZXZmbWFNVFc4OG4yaEV6TUFoVVVWZUxCdGwyNzBGYVpyODhTSmJtM3IreXNzSjRiakhoclkmI3hBOys5NmgrV3ZsZVhRdEI1WFNnWDE4d25tWGlWWkY0amhFMWQ2cnVUdHNTUjc1bVlNZkRIZm1Ybk8xZFdNMlgwL1RIYjlxQjFqL0FNblgmI3hBOzVZLzdZZXIvQVBVUlk1YzZ4RFdta2FoZi9tVjV0YTAxeTkwZ1J3YVdIU3pTeWNTVmlsb1crdDIxMGR1M0VqRlZEVGJvZVZ2T0hudlUmI3hBO3RXMU81MU9IVDlGMHE3bXVidGJaSmVFYmFpM3BxTGFHMmovWitINEtrbkZXSnh6K2I5Qjh2YUhyMnArVTlRdGIvUjlRbDFuekJxN1QmI3hBO2FlMFpoMUF2K2txeFIzTHpjRmlscWc5T285TmEwcGlyTWJ2UUxYekY1NjgzMkR6TkE3NlhvTTFsZncwTWx2Y1JUNmc4RnhFZjVrY0EmI3hBOytCNkhZbkZXT2pXNzNWZFM4K0RVNFJiYTFwL2xHR3kxZTNTdkJibU9UVVc1Ums5WTVZM1NWUDhBSllWM3JpcWVmbFhjUmVYNExUeTkmI3hBO3E4WWoxWFZZbHZySFdHcVYxTlRFRzRGMko0ejIwZEVNVmFjRkRJT05WVlY2WmlyenI4ci9BQzVaMkd2ZWFIUjNrVFJyMXRGMGVONkUmI3hBO1cxZzBVV28raEg3ZXJlOGQ5K0tJUDJjVlJmNVlSMkQ2THJEWHl4dHIwbXBYNitaZlZDbVF5QzRrV0paYTEvZGZWUkg2WDdQcDBwaXImI3hBO0V0TW5pZzA3eXZjbzZwNWNnODYzUzZMTjBpV3dsdHI2QzM0TjA5SXp5OEllM0VyVGFtS3N3ODFYdHAveXN2eVBZK3F2MXduVXAvUUImI3hBOytJUmkwWmVaSFljalFWNjcrQnhWSC9seG8wdWtlWFo3V1lLSlgxVFZwMkt1cmdpYlVyaVJEVlN3RlVaYWpxT2hBTlJpcktNVmRpcnMmI3hBO1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVlNhNjhxNmJkK1pZZGV1aDYwOXJBa05yQ3crQkhWM2YxVC9NM3gvRDQmI3hBO2RldEtWbkdETGlMbHcxazQ0VGlqc0NiUDJiSnpsamlJZDlPc0pMK0hVWHQ0MnY3ZU9TR0M2S2d5cEZLVmFSRmZxRll4cVNQYkZXRDYmI3hBOzMrYUhsWHk5NXYxVFRadE9jWHR2WngzZW8zMEp0QkpLb1UraEdzVFNwY3pzV1lScnhRaFMyNUEzeFZJL00zNXZlU3RNdTdpMDh4K1cmI3hBO1pvTlltRVM2cllYQjAxcERiMjROemJNWE53WTU5M2YwbzBabkxoZ0ZyMVZaYjVzL01IeS9vMm93YUhxOW5QS3VxUWg0cXhCNEpZUGomI3hBOyt1Y2d4cnh0WUY5U1lNdjJTS1ZPMktwUnBINWsrV0lkVHNvSlBMOTFvMS9yVVZqSHBva1MwRDNGaThwaXRuUG9UU0ZFaGFiZEhveWMmI3hBOzlodWFLb1hUZnpXOGk2eDV6bDBKZEdmNi9xaGwwdTd1cFZzeTBxMjB0MUQ2Y2tRbGE0a2gvY1NIa0l5cTh2aTQxeFZmSithM2ttNjgmI3hBO3dQNVh1Tklra2ZTZFJ0clcxMnM1STQ3aEw2Q3lqbFdKWldsZ0VjdHlqSVhSZVNodUZlSkdLcWx4K2UzbGEzOHpSNkZOYTNNYm1lUzMmI3hBO2x1V2EyQ3FZcjY0c0M2eEdiMTVFOVMwWm1NY2JjRUlacWI0cXEydjVwZVhkUHNScmQ3b1Y1b1drYXpOYlhFZXNYQzJzY0Z3THNMRkgmI3hBO2N5dkhNeFEra2lFaVVCK05OdHFCVkxibnpQOEFrLzVyMWp5N0xmNkhEcVYxNWdrdkxheXY1cmFHWkFsalBKYnA5WWtCYXNWeExFZlEmI3hBO0I1QW5zTVZXU2ZuUDVKMUxTN2ZUYmpRWkpiRFVMc2FTdW4zVDZha1FBUU53bWpsdUFrUlVVSG95QVBYOW5waXJQdEc4a2VUOUZkWk4mI3hBO0swYXpzNWtZdXM4VUtDVU1VTWRmVXB6K3dTdlhwdDB4Vk1kTzByVE5NZ2UzMDYwaXM0SkpKSjNpZ1JZMU1zekY1SElVRDRtWTFKeFYmI3hBO0ZZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxa2ZtSHpwb1BsNlNHUFZUZHgrdVkwaWtnc2IyNmpMelNlbEhINmx2REtucU85RlZDZVJxTnQmI3hBO3hpcU4wN1hkTjFHWm9MWnBCY0pCRGRTVzg4TTF2S2tOdzhxUk04Y3lSdXZKcmVRVUlydDAzR0t0UHIranBwbDdxajNTSllhY1p4ZTMmI3hBO0RWQ3hmVkN5ejhxajlnb2E0cXR1dk1taFd0aFphaGNYc2NkanFVa0VWbGNrbmhJOTFUMEFHSCsvS2loT0tydFM4d2FQcGpPdDljaUImI3hBO283YVM4Y0VNYVFRc3F5UDhJUDJUSXUzWGZGVlpOVnNKTlRrMHlPWG5mUXhMUFBFb1krbWpraE9iQWNWTDBQRlNhbWhJMkJ4VlJsOHcmI3hBO2FOREZxa3N0MHNjZWlndHFqTUNQUlVRaTRMTlVicjZUQnFqYjZRY1ZSc0U4YzhFYzhSSmpsVlhRa0ZUeFlWRlZZQWo1RVlxdnhWQ1gmI3hBO09xNmZhMzFuWVR6Qkx2VURJdG5GUmlaRENucVBRZ1VGRkZkOFZSZUtwVGVlVS9MOTZkVk4zWnJPTmJpamcxTlhaeXNzY0tzc1lwV2kmI3hBO2xRNW9Wb2UvWEZVa20vS1R5TmNRUEhkMms5NU5KejUzdDFkM1U5MFM0UUFtNGtrYVVtUDBrOVA0dmdJcXREWEZXUlh1aGFUZlh0cmUmI3hBOzNkdUo3aXlqbWl0eTVZcUV1VkNUS3lWNHVHVlFQaUJ4VklJZnlxOGx4V2MxcUxhNFpaQkNrRTBsNWR5VDJxV3ppU0JMT1o1V2t0bGkmI3hBO2NjbFdKbEdLcXVsL2xqNUswdTl0TDZ4c0REZTJiQ1NHNUUwNWtMQkpFWXU3T1MvcWV1NWs1ZmJiNG1xUURpcU51UEpYbHU0MDIrMDUmI3hBOzdVcmI2amNtK3VXamxsU1g2MFpSTUpvNVZZUEc2U2dPaFFqaWVtS3BmYmZsWjVJdDdtMXU0N0JqZVdmcG1HNmVlWjV1VVVzOHhkNUcmI3hBO2NzN1N2ZVRlcVdyNmdjaHFqRlYxaCtXUGsyeGtoZUMxbmI2ckpETFpSelhkMU5IYi9WbTV4UjI4Y2tySkZHcmY3clFCZmFnRkZWRnYmI3hBO3lqL0w1NzVMK1RTVmt2WVpWbnRybDVabWxna1c4a3YrVURsK1VWYmlkMlBBaXZRN2JZcXNpL0tMeVREZHBld1JYa045SE1zMGQ1SGYmI3hBOzNxektFUm8waEVnbDVDRlVkbEVkZUlCTzIrS3N6eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWaC81b2Y4Y2JTUDhBd0lOQy93QzYmI3hBO3BiNHFoN3pUOWJ1L3pJMWY5RjZ0K2krR2phVjYzK2p4M0hxVnV0UzQvYkk0OGFIcDFyaXJHQkpxVDZKYitXbGhsMXU5dnRmMUs1MUomI3hBO0lmUmdhU3owKy9hV1pqemVPTlZlWm9ZMkhMbzV4VmFpSmVhRGFlVU5ac1dnWFRkZnQ3UTZiY01qdCtqYnNTU1dxbG9ua1Fxc1RtRUYmI3hBO1cvM1dlbUtvWHpiUHF5dnJtaGFoSkkrbzZYNVoxQklkVGtXb3ViZVdhM052Y0hvRElPSlNVYmZHcE5BckxpcjBEeUxQYTJrZHhvRnomI3hBO0diZnpGYUg2eHFucU1YZThhWGI2K2tqQlRLa3BXbGFmdXlQVG9PSUdLb0R6cDVmZ3UvTjJnSDFDbHJyRWhzOWJ0YVZTN2hza2t2N1omI3hBO1hxYWZCTEVWTzN4STdLZGpzcWdiL3dEd2hONWw4d0R6M2NXOEVzRTBRMFNPOHVHZ1ZiRDZyRXdtdFFXUWVvYm4xZ3p4L0hVQVYyWEYmI3hBO1VMNWIxcTQwdlg5SnZ2Tmw3OVFqdmZMeVJSM0dvU0NBU1N3M1ROU1JwT0NpZjBKRVoxTkc2N2JHaXF6eVZkUmFwSm9sL0hkeHl4bnomI3hBO0w1amt0VExLcXlTUU5KZWhCQ2prTzRBWlR4VWJEZm9NVmVxNHE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFkmI3hBO3E3RlhZcTdGWFlxN0ZXRWZtUDUyMWJ5OWVhSFlhWmJXazgrc1N6SjZsODF3SWs5QkZjYlcwVnhJU3hiK1hiRlVGSCtabXRQSkhyUDYmI3hBO0p0bDhueTZxTkVXN055LzEvd0JVM2hzQk9iZjBmVDlMNno4UEgxT1hINHY4bkZWUDhwdnpSdjhBenRMTXQxcDF2Q0lyV0s2RnpaU3kmI3hBO3l4eEdkai9vcy9xUlJoSitLaVNpTTFWTlRUYXFxRWkvTi9WbWtuZ0doTCtrYlNXMzBlOGlNckpHTmF1cnBvSXJjU2xHL2NDSmZYWismI3hBO0orRjBvQ1RpcVBUOHlOWnR0YXRmTDJzNlpiUjZ5ZFNzN0M4YTFuZWEyTnZxRnRjM0VjMFRTUnhQeURXYkl5TXZ2WEZXUGFoK2UycVcmI3hBOzJxVzl2RG85ck96elgwQzJwbmxXNnVEYmFwTHAwY1ZvRmhrVnBYRUlrNHRRZHFqcmlyMldnKzdwaXJIdk4zbXZTTkFqaGt2SVRjemgmI3hBO0pib1JJRkxSMjFxQTl6Y3N6MENKRUdYZXU3TXFqZGhpckhQSlg1eWVUdk43dzJOeDZWaGZYWUQyRnBjeXh5TGNsVlVTQ0Z4OERPa2gmI3hBO1llbjlzcHhrNDhXR0t2UXdxam9BTnlmcFBVL2ppcmVLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjImI3hBO0t1eFYyS3V4VmpYbXpWZkkramFqcEdxK1piKzMwKzZnZWFQU3A3bVV4THltUUxOM0NINEtWTGRNVlN3YUwrV0IxcHRhV2VONTAxR0UmI3hBO05DTHVack1hcGRMSEpCSUxRU0cyK3NTQ1pIVndsU1c1ZGQ4VlVQSlY3K1Qybld0N3FQbGZVN0tLMHNMU0MyMUtSYnhqSEhid0YvUmUmI3hBO2RaWElxT1RLc2pDcEh3MTJwaXFJdHY4QWxWbm1DeHZCYTNkcmYyM21xK1V6bUs0WXRMZndXeWxQVEt0emhsamhzMWRlSEVqanlHKysmI3hBO0txUCtIL3l0T2oyeUc2NVJhdHFTcmFhbzk5Y205bTFLQXZFZ2p2V2wrcytvbnB5SW9EN0RrdlFuRlVKY2FQOEFrcmIzazJpUzNGcEYmI3hBO2Y2TForclBiZlc1QmNRUTI4dzFCcDJibjZucXJMKytlU3ZQZXBORGlyTjlCOHhhSjVnMDhham90NUhmV1Jab3hjUW1xOGwrMFBveFYmI3hBOzgrZjg1VitXUE1tcTNwVFM3QzZ2WkwyeHRFc1V0UFZrYVEyVnpjUGVXNGhqUHhzNjNVRTFDcDJpTEQ3Sm9xK2ZmTDF0ZDNkczNrL1UmI3hBO0lTbm1SdFVzckRTTFdVR0s1aWU1a2todUluNUFCUWpjRFNUZU42RUFiNHEvUWJ5OWFhbForWDlNczlVdUJlYW5iV2tFTjlkZ2tpV2QmI3hBO0kxV1dTcEFQeHVDZHhpcVlZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZXSGVlZkkmI3hBOzF4NW4xalE1ZnJVbHBwOWlMMUw5cmVVeFhESmRRaUlMR2VMN0hjTjAyNllxa0kvSy9WN2JXV3N0T1d6ZzhydnJHbWExSEw2c3B1SVYmI3hBOzB1MnQ0RXRFZzlNcXdZMmEvdkROc0NmaEpHNnFRNkQrU0htblQ5T2hTN3ZMVzl2N0NMU3BOTmVXV1pvVWswNjROeExZc2dqVWZWcFgmI3hBO280azRsdzNWV0NqRldUNnQ1SjgyZVpMN1NMM1ZWc2RIZTAxWTNzNDBtZWI2eUxaZFBudFZyZG1PSXl5bVNZZjdyUUttMVRpckdMNzgmI3hBO2xmT3Qzb3VtYVdtcDJOdXVoeDZoY2FmTEtzMTB6YWhkNmk5M0JMV3NCUm9vMGpIcUhudXovQWVwVlRIV1B5ejg2WCtwYXpMQitqcksmI3hBOzIxZXkxQkxoRW51Skk1THErc2ZxNmtXOHNUaTNjVFVNazBVZzVvTjBxVGlyUGZJdW1hdHBmbHExc05WWGpkMjQ0SC9TNUw0RlJRQWkmI3hBO1dTS0JxZUM4ZmhHMVRpcWY0cXdHWDhtdkswLzVyajh4N2hGZlVJcmFPSzN0RlFMR0xsT2F0ZHlHcDlTVDBtVkUyQVhqWGRxRlZXZlkmI3hBO3E3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXEmI3hBOzdGWFlxLy9aPC94bXBHSW1nOmltYWdlPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgPC9yZGY6QWx0PgogICAgICAgICA8L3htcDpUaHVtYm5haWxzPgogICAgICAgICA8eG1wTU06UmVuZGl0aW9uQ2xhc3M+ZGVmYXVsdDwveG1wTU06UmVuZGl0aW9uQ2xhc3M+CiAgICAgICAgIDx4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ+dXVpZDo2NUU2MzkwNjg2Q0YxMURCQTZFMkQ4ODdDRUFDQjQwNzwveG1wTU06T3JpZ2luYWxEb2N1bWVudElEPgogICAgICAgICA8eG1wTU06RG9jdW1lbnRJRD54bXAuZGlkOmVjMzdkYmUyLTYxOGItODY0Ny1iYWJiLTgwNDBmOTFhOGUzMjwveG1wTU06RG9jdW1lbnRJRD4KICAgICAgICAgPHhtcE1NOkluc3RhbmNlSUQ+eG1wLmlpZDplYzM3ZGJlMi02MThiLTg2NDctYmFiYi04MDQwZjkxYThlMzI8L3htcE1NOkluc3RhbmNlSUQ+CiAgICAgICAgIDx4bXBNTTpEZXJpdmVkRnJvbSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgIDxzdFJlZjppbnN0YW5jZUlEPnhtcC5paWQ6YjhmZGIxOTctNThmNS1lYTRlLWFlY2ItZDRhNzg3OWVkOWFlPC9zdFJlZjppbnN0YW5jZUlEPgogICAgICAgICAgICA8c3RSZWY6ZG9jdW1lbnRJRD54bXAuZGlkOmI4ZmRiMTk3LTU4ZjUtZWE0ZS1hZWNiLWQ0YTc4NzllZDlhZTwvc3RSZWY6ZG9jdW1lbnRJRD4KICAgICAgICAgICAgPHN0UmVmOm9yaWdpbmFsRG9jdW1lbnRJRD51dWlkOjY1RTYzOTA2ODZDRjExREJBNkUyRDg4N0NFQUNCNDA3PC9zdFJlZjpvcmlnaW5hbERvY3VtZW50SUQ+CiAgICAgICAgICAgIDxzdFJlZjpyZW5kaXRpb25DbGFzcz5kZWZhdWx0PC9zdFJlZjpyZW5kaXRpb25DbGFzcz4KICAgICAgICAgPC94bXBNTTpEZXJpdmVkRnJvbT4KICAgICAgICAgPHhtcE1NOkhpc3Rvcnk+CiAgICAgICAgICAgIDxyZGY6U2VxPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOjQ2ZTVlNzM5LWZiZjctY2Q0Yy1iNjgwLTU0ZTdjMjMwOTUyYTwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAxOC0wOS0yNFQyMTowMjoxOSswNjowMDwvc3RFdnQ6d2hlbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnNvZnR3YXJlQWdlbnQ+QWRvYmUgSWxsdXN0cmF0b3IgQ0MgMjIuMCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpjaGFuZ2VkPi88L3N0RXZ0OmNoYW5nZWQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOjJiZTI5MmIwLWMxYWYtNWU0NC05MmNjLWUxZTZkYjVkZTQ2ODwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAxOC0xMC0wNVQyMDowMDowNSswNjowMDwvc3RFdnQ6d2hlbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnNvZnR3YXJlQWdlbnQ+QWRvYmUgSWxsdXN0cmF0b3IgQ0MgMjIuMCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpjaGFuZ2VkPi88L3N0RXZ0OmNoYW5nZWQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5jb252ZXJ0ZWQ8L3N0RXZ0OmFjdGlvbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnBhcmFtZXRlcnM+ZnJvbSBhcHBsaWNhdGlvbi9wb3N0c2NyaXB0IHRvIGFwcGxpY2F0aW9uL3ZuZC5hZG9iZS5pbGx1c3RyYXRvcjwvc3RFdnQ6cGFyYW1ldGVycz4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPnNhdmVkPC9zdEV2dDphY3Rpb24+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDppbnN0YW5jZUlEPnhtcC5paWQ6MDhjNzQ2ZmEtYWM4Mi00OWIzLTk5OTctNzY3ZmU2NGI0NWZhPC9zdEV2dDppbnN0YW5jZUlEPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6d2hlbj4yMDIwLTA5LTIyVDEwOjM2OjA5KzA2OjAwPC9zdEV2dDp3aGVuPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6c29mdHdhcmVBZ2VudD5BZG9iZSBJbGx1c3RyYXRvciAyNC4yIChNYWNpbnRvc2gpPC9zdEV2dDpzb2Z0d2FyZUFnZW50PgogICAgICAgICAgICAgICAgICA8c3RFdnQ6Y2hhbmdlZD4vPC9zdEV2dDpjaGFuZ2VkPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDphY3Rpb24+Y29udmVydGVkPC9zdEV2dDphY3Rpb24+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpwYXJhbWV0ZXJzPmZyb20gYXBwbGljYXRpb24vcG9zdHNjcmlwdCB0byBhcHBsaWNhdGlvbi92bmQuYWRvYmUuaWxsdXN0cmF0b3I8L3N0RXZ0OnBhcmFtZXRlcnM+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOjNmYTA5MzY1LTdmNzktNzc0OC05OTg5LTI1YmEwM2FkMTY1Nzwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAyMy0xMi0xM1QxNDo1ODo0MiswNTozMDwvc3RFdnQ6d2hlbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnNvZnR3YXJlQWdlbnQ+QWRvYmUgSWxsdXN0cmF0b3IgMjYuMCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpjaGFuZ2VkPi88L3N0RXZ0OmNoYW5nZWQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOmVjMzdkYmUyLTYxOGItODY0Ny1iYWJiLTgwNDBmOTFhOGUzMjwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAyMy0xMi0xM1QxNjoyNjowMyswNTozMDwvc3RFdnQ6d2hlbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnNvZnR3YXJlQWdlbnQ+QWRvYmUgSWxsdXN0cmF0b3IgMjYuMCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpjaGFuZ2VkPi88L3N0RXZ0OmNoYW5nZWQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpTZXE+CiAgICAgICAgIDwveG1wTU06SGlzdG9yeT4KICAgICAgICAgPHhtcE1NOk1hbmlmZXN0PgogICAgICAgICAgICA8cmRmOlNlcT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpsaW5rRm9ybT5FbWJlZEJ5UmVmZXJlbmNlPC9zdE1mczpsaW5rRm9ybT4KICAgICAgICAgICAgICAgICAgPHN0TWZzOnJlZmVyZW5jZSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD5DOlxVc2Vyc1xTQ0FMRUxPVFxEb3dubG9hZHNcR3JvdXAgNTEyODA4LnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjpkb2N1bWVudElEPjA8L3N0UmVmOmRvY3VtZW50SUQ+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjppbnN0YW5jZUlEPjA8L3N0UmVmOmluc3RhbmNlSUQ+CiAgICAgICAgICAgICAgICAgIDwvc3RNZnM6cmVmZXJlbmNlPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpsaW5rRm9ybT5FbWJlZEJ5UmVmZXJlbmNlPC9zdE1mczpsaW5rRm9ybT4KICAgICAgICAgICAgICAgICAgPHN0TWZzOnJlZmVyZW5jZSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD5DOlxVc2Vyc1xTQ0FMRUxPVFxEb3dubG9hZHNcR3JvdXAgNTEyODA4LnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjpkb2N1bWVudElEPjA8L3N0UmVmOmRvY3VtZW50SUQ+CiAgICAgICAgICAgICAgICAgICAgIDxzdFJlZjppbnN0YW5jZUlEPjA8L3N0UmVmOmluc3RhbmNlSUQ+CiAgICAgICAgICAgICAgICAgIDwvc3RNZnM6cmVmZXJlbmNlPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgPC9yZGY6U2VxPgogICAgICAgICA8L3htcE1NOk1hbmlmZXN0PgogICAgICAgICA8eG1wTU06SW5ncmVkaWVudHM+CiAgICAgICAgICAgIDxyZGY6QmFnPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmZpbGVQYXRoPkM6XFVzZXJzXFNDQUxFTE9UXERvd25sb2Fkc1xHcm91cCA1MTI4MDgucG5nPC9zdFJlZjpmaWxlUGF0aD4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmRvY3VtZW50SUQ+MDwvc3RSZWY6ZG9jdW1lbnRJRD4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmluc3RhbmNlSUQ+MDwvc3RSZWY6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgIDwvcmRmOkJhZz4KICAgICAgICAgPC94bXBNTTpJbmdyZWRpZW50cz4KICAgICAgICAgPGlsbHVzdHJhdG9yOlN0YXJ0dXBQcm9maWxlPldlYjwvaWxsdXN0cmF0b3I6U3RhcnR1cFByb2ZpbGU+CiAgICAgICAgIDxpbGx1c3RyYXRvcjpDcmVhdG9yU3ViVG9vbD5BZG9iZSBJbGx1c3RyYXRvcjwvaWxsdXN0cmF0b3I6Q3JlYXRvclN1YlRvb2w+CiAgICAgICAgIDxwZGY6UHJvZHVjZXI+QWRvYmUgUERGIGxpYnJhcnkgMTUuMDA8L3BkZjpQcm9kdWNlcj4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/Pv/gABBKRklGAAECAQBIAEgAAP/tACxQaG90b3Nob3AgMy4wADhCSU0D7QAAAAAAEABIAAAAAQABAEgAAAABAAH/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgMDAwMDAwMDAwMBAQEBAQEBAgEBAgICAQICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//dAAQARf/uAA5BZG9iZQBkwAAAAAH/wAARCAEIAiUDABEAAREBAhEB/8QBogABAAMAAwACAwAAAAAAAAAAAAkKCwYHCAEDAgQFAQEAAAQHAAAAAAAAAAAAAAAAAQIDBAUGBwgJCgsQAAAFAwIDAgEHCg5zAAAAAAIDBAUGAAEHCAkKERITFCEVFhcaOHa3GCIxOUFYeJe21xkjJCUzVVdZlpiotdTYJicoKSoyNDU2NzpCQ0RFRkdISUpRUlNUVlphYmNkZWZnaGlqcXJzdHV3eXqBgoOEhYaHiImKkZKTlJWZmqGio6SlpqepqrGys7S4ubrBwsPExcbHyMnK0dLT1dbZ2uHi4+Tl5ufo6erw8fLz9PX29/j5+hEBAAAAAAAAXkMAAAAAAAAAAAECAwQFBgcICQoREhMUFRYXGBkaISIjJCUmJygpKjEyMzQ1Njc4OTpBQkNERUZHSElKUVJTVFVWV1hZWmFiY2RlZmdoaWpxcnN0dXZ3eHl6gYKDhIWGh4iJipGSk5SVlpeYmZqhoqOkpaanqKmqsbKztLW2t7i5usHCw8TFxsfIycrR0tPU1dbX2Nna4eLj5OXm5+jp6vDx8vP09fb3+Pn6/9oADAMAAAERAhEAPwC/xQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQf//Qv8UCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUH//0b/FAoPJSnX3oTRqD0azWppKSq0pxqZUlU6jsOkKEyggYij055BsyCYScSYC4RAFawgite17c6D6fcQPQX6+5pE+DJ4a/n0oHuIHoL9fc0ifBk8Nfz6UD3ED0F+vuaRPgyeGv59KB7iB6C/X3NInwZPDX8+lB33jbLGLMzR0cvw/kvH+VomW4qWccoxtMo7Oo6B2RFpzljWN7i7k6NoXFISrKGaRc3tSwmguINrCtzD9vIOSsdYli6yb5Vn8KxnC245GmcJfkGVMUMi6FQ4qSkTenWP8jXNrSlOXLTgEkgGcERpowgDa4r2tcPugeQYFlOKNU8xjN4hkaDvvfvESZwOSs0vijz4mOSxmcvEqRR9a4tDj4nO7coSH9icPsVJBhQ+QwCDYOX0CgUCg6bi2ovT7Ocgv2JYVnXDcwypFTnxNJ8ZxbJ0JkGQY4ojLiFokid+hjS+K5GznR52FZKuAoTFiSKL2LNsEfptB3JQKBQKBQKBQKBQcOmeRMf44QpHPIc6h0DbV6vuCFwmcmZIuhWLuxMUdySK3xchTqFfdyRj7MAhD6A3vy5Wvewf3mV6ZpI0t79HXdsfmN3SEr2p6ZV6V0aXNCoBYada3uKE09GtSHgva4DCxiAK3hte9B/ToFAoFB17Dst4pyGuXtmP8m49nLk1k2UubfDppG5Mubk9zu72PXpGVyWqEZNz79HUYEIevwc+fgoOwqDhWQclY6xLF1k3yrP4VjOFtxyNM4S/IMqYoZF0KhxUlIm9Osf5GubWlKcuWnAJJAM4IjTRhAG1xXta4fdA8gwLKcUap5jGbxDI0Hfe/eIkzgclZpfFHnxMcljM5eJUij61xaHHxOd25QkP7E4fYqSDCh8hgEGwcvoFAoPPsT1aaVp9NycZwXUxp9mmSFKtzQJ8fxPM2OZHNz1zKQrUvKImKM8kWPxqtpTIDzFJYU9xkAJMEOwbAFewegqBQKBQdHD1OabAZMthYeoTBwMx3cwMtsTDyxAg5Mu8mJAry2i0Du/2lPimYhFY4Kfuna3KvYfT0+Gg7xoFAoFB0ZkfU/ppw7JUULy5qHwZiyYubcjeG2J5Hy1AYPJXBpcFixuQOiJik0ga3RW3LnBuUEEnllCKNOIMAEVxAFawd50CgUCgUCgUCgUCgUCgUCgUCgUHSEh1M6b4lkZBh6VagsIRnLjq4sDO14skOV4Gy5GcnaVjSFxdrQQhyfk0mWOMkMXkBQEFpRGrBHF2KCO4w8w7voFAoP//Sv8UCgqNyPgxtr2USF+kq/PGvYldIXl0fFpSPKGnktIUrdlx69SWlLO0tqDgJgHKBWBYZgxWDa3MQr+G4fxvKVO1l775r/wDZp6dfiqtBU335tobTZtc60NL2nTAE3zjL4TmzGscmUqdMwyWBSCVN7m8ZWkkFUkR9dCsaY+aEqADQzlGACpQqzLKRCFcYgXsWELZHlKnay9981/8As09OvxVWgeUqdrL33zX/AOzT06/FVaCfjbT228G7WGnRXpk0+SrK8xgazI0myca75kfIhIZcF/lbbHWpxSFr4TBceM1mglPGSLkl3QXOCMZlxGjtcNgBGFxYfqk3UP8AaxNPHo1Q2g7E4XH1RRoZ+/mf1sPUFQT/AFAoFAoM7/ZA+Wr/AHSvtYm5d+tdtlBogUCgUCgyyOIw3RNU+at0TUJA9Kudc9wbDOjaMocPOyLCuTZ5DmIx8hL2Siy/O5U3wZ7b0feGzLUyMjQ1qi5l7J2xJa4i+rswhfS2PdbQtfm2Npfzu8u5jxklvhhWJ80qFRhhrkblrE9wQ6UPTqYIAS7rZwnQJZHaxdxgAS8lhvewrCCEJZaBQKCl9xtPmC9JvsXYPQayZQeTOE03WZJjp9T7Smq9c4xsx+ZW3KmjN3myhQgUAbsgxdsyjfECbxR5AsyzyJSMmXxC9rlgUBVqySxGXVoCrBf0oFAoFBnocHF5vTc385jR6MsloNC+gre8WH6pN1D/AGsTTx6NUNoOxOFx9UUaGfv5n9bD1BUE/wBQKCj5xAW+XljIeUw7Qm1Aqd8iZ8yW7jxdm3J2JDz3KUNr85mqG90wNil1QdkkQSQpIAzx2SIpTYpgTBOS2OTqCVxyIJidi/YvxHtK4jtKZTZhyXrQyWwpicvZeJTXUN0TblFyFpmJsTGLSCVjZCGxYSC65dcBK2RLSQqVISiCkSJGE/VAoFAoKGXFvaEZvhjJuA96DS+J5iWQsey/HcQzjJ4uX0q4vMYc5olGnnN55xZYxplCZegIiy1Qde6cQiWJOEFhDMuYFt/bQ1wQ3cV0SYF1aRDuSNTkeIEFT6NIzhG2hOVY4MTDkmHisbyVBTM8sQqe5GHBANU2mJlNrdB4L3D3dQKDgeUsmQjC+NMgZfyW/oorjvF0Mk2QJzJXEfZomGJxBnWPz+6qb/I1y0LWgNM6Q2uIXTyDa972tcM7nZ6xlkDfy3xsy7oGf2E4GANNcxYMhRqIOxI1TQjeWkapr0r4cSgOGrbFIoS2R3xzP40wrkqHRvuM0kNne17BpBUCgUCgUCgUCgUCgUCgUCgUCgUGa/u6Mixq4vPR0uVXJuRJdUm1s9t1ihiGMKMifYijg7KQ3ACxR3igwH3sG1xWuXcF+fO97WDSgoFAoP/Tv8UCgUCgzjOMK9Wm7fv2oiD/AK0VOaDRzoFAoK3vFh+qTdQ/2sTTx6NUNoOxOFx9UUaGfv5n9bD1BUE/1AoFAoM7/ZA+Wr/dK+1ibl36122UGiBQKBQeKNxvV0yaENDeprVk9DSXOw7ix9eYmhWjKLSvmSXjsYviyNniNv02JkmR3xrQmXsEYglqBCsAd7dFwpi8Kztmseq/SxuQ6ndSSRQ/h1ox2e6OmKSO6YKl6OjEiQ2lmcZ2kU3NIVqVrzPnlgGlUkmphkOkaOEEfXYIig/Y4RzPEx0n6zNde0dm5SY0SNNJpXNomzKrnkok+Y8FPV8aZhamok0VrnLZjDk7c4lGdnYJjfFxD6/CXYQaBNAoFBS+42nzBek32LsHoNZMoPGu6BtdTHJ+zntQbqektO5x3VNo12+tEb9kZwhQ/EyVSPEUMwRjiTsuRmxQkAFQfNcCPJQnEs+1wnjYTVXUMzxPRE2C0Zsl7pUQ3W9FMRzL2zU1Z2gXccdaloIgEAjxu5Pb24owUmaW247qE8IyShD4rNAvcwonrUIO2NPb1ArBL/QKBQZ6HBxeb03N/OY0ejLJaDQvoK3vFh+qTdQ/2sTTx6NUNoOxOFx9UUaGfv5n9bD1BUE/1BS44gffTySRkFLtNbWDg5z/AFZ5VfAYty/kXFxpjjJMevEgPLaQYVxY5oRBTEZXc+3MA/PJZ4QxJNYZIDCnLtzmkJHthrYaxrtUY1LynlMthyXrmyWwgKyNkYoFnJnxazuVilSvFOKVaooJxbcWcENnl5sEtU+qi/mGjLIICFimgUCgUCg6V1HYAxrqqwNlvTjmFm8XsZ5ogchx/MG8A7Eqwtb+hNS2cmlXcAxNz8yKhFrW9WC3aJFyco4HIYA3sFDzh1c55P2mN1vU3sq6oXhWii2Tpy7EYpXOljm9iMzPGWkLtBphHkikQiG9j1LYXClPJGM0Rp6xEypQh7UwdqDQtoFBSr4vfcTe4linFm1jgo1e8Zg1WL43K8uN0aNNUvxGLEkqLQ48xykQoL9+Md8wZJbAi7IIrCG3MhiYZRhTkG4QsEbNe3ey7Y+gTDWm0SRqHlExuFkLP8ha7p1AJJmuZkplst6XMgomzs1RIopNH2tRcIbmtbSnHcNhiHe4SmUCgUEbmp7eA2ydG7w5xnUVrSwnB5gyhPE9QNrfleRsiMwiACMEQ749xg3TOatiswIb9kSegLNOv4Cwiv4KCPNPxWmyEc7WbjNUUxSI7qzE935Rpz1BiaQkgGMIV9yUuN1L53Q6wbCDayK59rCt1FhvztYJONLO6Pt561lhDRpg1eYVypJ1JfbJ4IilJcbyUeRYoRw1BWMpoTG8gDTElhvcwyzb0F3tyFe1/BQe96BQKDxvn/cH0WaWMnQTDGobUXjvE2UsnImpwx/CJYuXJXyWo3yQKoq0nMpCdApLVd+kSI1IANh2F2weV7Wte17h7IoFAoFB4tz5uK6INLeXIbgbUHqVxrijMWQ2iOv8Jx5KnFYnkkmZ5bJnmGxte1I06FSE8l5lMeWoSPTrCGoTDDy8Fr3D2lQKDOM3l/lrb2/Pte+2H6PMXoNHOgUCg//Uv8UCgUCgzjOMK9Wm7fv2oiD/AK0VOaDRzoFAoK3vFh+qTdQ/2sTTx6NUNoOxOFx9UUaGfv5n9bD1BUE/1AoFAoM7/ZA+Wr/dK+1ibl36122UGiBQKBQUWuM51dPC2N6SNtXGQ1btNcwy1PnbIMcaRgG6OLS3uLhjjCEYskLuM5aTMpyufFNihdnaythSiD13vfswtnbcmkVk0IaG9Muk1lAkudh3FjEzSxciAUWlfMkvHbSjKckICVbpsTJMjvjouLtcQxBLUBDcY7267hR44gyKPm01vxaQd1TGjWoSw3MrrGclTBEyliRieZfisLRi/UTD0wCzSEhPkiYSkLXc4ztChK1rytMMDe/WYYGh9E5VHp1FYzN4i7JH+JzGPs0qjD6gEIaF6j0hbkzuyuyIYwgGJI4tqso4u9whvcA7c7W9RQcgoFBS+42nzBek32LsHoNZMoLHO1SjSOG1PtuoF6VMuQrtvfR6jWolhBSlIsSKdOGOyVKVUmOCMlQmUEjEAYBhuEYb3te17X5UFKXN0Ym/C2b1sfz3Amt5N2zNaa1xTP8AGGNOpPZmKCuTySrmmPSG8sBxfj306SJzJfYvYIO8Lo2oCgLP6lTn0BoeQqZxTI0PiuQYHIWqWwicR1mlsQlLEsKcGWRxmRNyd2Y3xpXEXESrbnRtVlHEmBvyGWO16Dk1AoM9Dg4vN6bm/nMaPRlktBoX0Fb3iw/VJuof7WJp49GqG0HYnC4+qKNDP38z+th6gqCO/iC99qZ4wlCPa62zHVxnmuPLr834yyHL8bFieX7DyuXnkszbjDHixCbcHk9yhSvASceX1Ciqcd72EU5jLMbw9h7CGwhBtr+DF55zyWy5L17ZLZTBzKZDMLfWfCbO+l9u544xw5n9r3x5WdrcEikQL9q5m9SZMIKEIhKwsl0CgUCgUCgUFKfi59vKSuUGxHuz6c06+PZs0pO8SY8vSCKiOSSK2Pk0tSuWKcpJO6FiME+YfyQvCUYrDa6gLc7ANNHZM1g7MLHO0xr3jm5RoMwVqmazEBEukMftFcyR5BcIQRPNMNAS0ZDZrJrWCJGgWuYQujaAVuoTQ4pDL/I9B7OzbmXHWnfD+TM7ZckKaKYyxFCJJkKcyBTa47N0cizWpdnIaZMD3OcHE8lNcpKlKsI9WpGWSUERhgA3ChDsJYWn+8tvAakt57UjGzFOK8M5EUOGIGN66HFoQ5du3IUWGIQ1hOONKPL074qAhchnACG5b4Y1LLe5hg72DQvoFBx2Xy6LwCKSWdTZ/aorDYawu0olUmfVpDayx6OsKA9zeXp2cFIy06JubG9MYccaMVggLBe9/UUGfDqv3Ydyvf8AtVkg0EbP/jqw1pcYlrgkm2am91kOP3GYQ9I4OTYblDMOTWxvDI8W4mkSQvk1RVCTZ6eLDEUqKWqDAt6MJZdF/B8bdGFo+1O2rl1yBrHygaWmWPxa+USXE2JETp3UgZ5DDF8dvbPNXJMnc7mi7Z1f1JawuwO0SFWuYWMJUlHD97M6lpuymbfOCgoxJC0Vzk6aVJHbsSgAAEdn5LJiXwKu9gW6j7KLHjvzuId73ve4Qx63uDl0f5BbVE02+8mTnSNlxmEByi0VlkplOUMNqnRAb3ttLu8vit1zJCV/ewg5OxLw92S2AEQG8wdr3uHiTbe3yNcG1jqzS7X+95aTOMPSOrZF4RqJnapQ8y7Hja6KTWqITFyyCYUIWbdPclVJb2LkCgw92Z/c656g0tIa3pAv9JlKdYnTrEZ5KpIqJKUpVSY0B6dSnPAE0g9OeUIRRxJxQrCAIN7hEG9r2vyoPuoM9DirPV021b5zMI/rV8moNC+gUCgUGcZxTPq//bj+1EaQf1tTUJQaOdAoM7bdlY0kh4vLQQgWmKCiU+TNv58AJKMoBt1cYyCRJUBYrmknhumOXNJYDrWDYQiRCsEQBXsMIaJNAoFB/9W/xQKBQKDOM4wr1abt+/aiIP8ArRU5oNHOgUCgre8WH6pN1D/axNPHo1Q2gjE2Fd+rae0XbT2lPTRqX1WeRrm3Gvk5+PWFeQZqSmPiL48dSWYZ/HPjI4Bh6UxJx8UYlKUCv3SLz+x7fsjeg4BhYAl/8tHbFHr83wmbWH8V9oHlo7Yo9fm+Ezaw/ivtA8tHbFHr83wmbWH8V9oHlo7Yo9fm+Ezaw/ivtBV94ejKUEzjxNmv/NeLX3x0YyzAZr8yljqTeJjwyeOKCZA1MxqWRF98RpE3tEgaPFePu6dR3VckSrCO06DiizAiAENICgUH1nHEpyTVCg0sgggsZx55wwlEkklBuMw00wdwgLLLAG9xCve1rWtzvQZw+33a+97xP2UtYbiUY+6dtLEmccuQkSiyZU1jiGDD2/Gml5OkMAJQiROMjm5aGamEF3UBGYlX2AZfnY6waPlBXZ4oXRLbWHtRZekbA0hcMm6TVZGpuEjKIGNaawQhCuR5dagHFHFmBSG4qc3Rx7HoOCoWNSUPRYdgGFhwfhS9bFtV21bBsZSJ3EvyXo2kCrT2/kqjRmLjseokpUgws7BAIw2xbQlg7iGOpbcw3642d6YENgXEFl6gUFL7jafMF6TfYuweg1kygshbTvqrLbT9gA0b/rOuOaD+ZunbeWONzzRflLSxPe4Nb49JASnEE8Vpe8H4zzHHE6syEzJOIBJ6oCDtVRzc7FkBscqY3BanBcIjbDCFYzhfdw7J2Bsp5U2M9cihREcx4Kk00S6dAS107VXc2NrFS7IOB2xaaG5bsib04D5RFDSzTCVbMYtCQOyYlCWILwtAoM9Dg4vN6bm/nMaPRlktBoX0Fb3iw/VJuof7WJp49GqG0FXPAu+jMNMOx/oT21tvsuQTXcKzCLOkXfXKEM6p9fsHNeR9WedFUYZ4mhTEnnuWdcgNL2jOZiSSjbtDcsA4C6VBqHmFlXYG2Bo7tzR0rVRqoKbsmbgWTG5W4PDw4Ky5Q3af26UFmHPUTib0cYrA95IewKzASaTAMMudcwxAgMujupUuYWeaBQKBQKBQKBQcKyTjqE5fx7OMU5KjjZMMe5JiUgg04ir0nAraZFFJU1KmR+ZnBOO1wmpHFsWmlDt6nkLnblflewUFtlibzfY53u9Qe0JnOQrRYG1OSZAnwbJnhRya3GZK0x71p0nSYzsAoynHLEJWjiTySjBaw5WWiSmGXC3+APWvFwa3ppLkenjZ20zWXy3NOqWYweU5YikWPsoeXBhVSxOz4NxMcUnUCLsryHkkizyoTn2KNIJY28297p1vO4WctsjQpBduDRNg7SfCgIlKyCRklwyRKEgDrXnmXZIEDtkmaGjUiGrumdpKeaBAUaIV0TUQlSBvYsgFrB73oFBS64xrXtL8V6esI7fmJHB1JmWrh1XSvKpEfAtE9K8Qwh3bEEcg5IUfSpUF5QyKrDYZSexg1CePHpTQ9kruA0J0dk/bMhe11oXxthpM0IPJtm7Y05I1LTEBSY5zkeW31qTHOTAF0AmTqFESxwUbdlZSb2AWEhOYquCylYqGYEulAoFBXZ4lPbAi24FoAyBkOLRVAfqf0pRt+y9iGSpUhdpC+xSOozHnJ2JTVIOk9wbJdF0J6pvS36rhf0KK5dwBMUWMDpnhONf79rD25TcK5GflcgytookjViFS5uKuy10dMNvzYpdsJL3A4ZwlHUztzS6xsiwgBtdHHSRdZhgjLhC0ZQZ6HFWerptq3zmYR/Wr5NQaF9AoFAoM4zimfV/+3H9qI0g/ramoSg0c6BQZ92680kt3F4bcqws0wwb866KXZQAfT0kHE5GmDEEonpta9y7kMoB36ud+sYvWcrWDQRoFAoP/1r/FAoFAoM4zjCvVpu379qIg/wCtFTmg0c6BQKCt7xYfqk3UP9rE08ejVDaCPfh/9lHa51cbR2kvUJqL0iwzKGZMg+Tx48Zy7SzKDY4PnjU1M5lhEe7whjs6Z2YjxMisaQowdimL6gJwiH1DuIYgmQ8rg7Jvrg+O/gd5q9ubQPK4Oyb64Pjv4Heavbm0DyuDsm+uD47+B3mr25tA8rg7Jvrg+O/gd5q9ubQVQuH0xvCcOcTvuE4hxowJopjjFa3cDxvj+LIz1qpJGoTB9TscjEUYEqpyVLXFSmZ2JrITgMUHHHjCXa5gxCvcVw0d6BQQccRVraDoc2pdRcrZXfxKydm5qBpqxKIlUWkXglGXkTk1SR5bTrKSFZDjEsYpH53SnEBMGUtREc7BDe5gA8AcIHolDp324XbUxJmjuWQ9ac7VTBKcoSlp16bDONFDrCsaIDrGJgLbFuj9eRPZA+1ESoQOyUwAA+EYwtjUH8x6ZWmSMzvHX5vSO7G/Ni9lempeSBQhc2l0SmoXFvWJx2uA9ItRnjLMBe3IQBXtf1NBnN7Izy7bOXEQ6lttWcOS1vxXnt5kOHYoe5DUlJXJa2lKMv6Tpi4XNM6lDjI4C9nspHKx/Jwk9w9fTYZlg0d6BQUvuNp8wXpN9i7B6DWTKCyFtO+qsttP2ADRv+s645oPf9BTC4p7bOn4kkC3ktGo3GHak9JSiMvmanSHAAmkjhAoM5I3CCZrbQEJTbr5NhVyJAW5jPAbY6LisYcIKZo7MwJ4Nmrc6g26topg2fWrxOZctRzsMe6icfJDiwmQ3LjK3Ixu6tvRXOOUFQybpzgPDGYIRlrI1V0ozBKkioIAldoM9Dg4vN6bm/nMaPRlktBoX0Fb3iw/VJuof7WJp49GqG0FJPCG3DrB0p6BNBW/7oNd1sqkkEW5dledIddlC/umNDsbZ/zPigueksZfIUqwzJMax8prliUvs1rQWYetuZdGeee2BoX7PG8PgHdxwCXOIOYigmeoIibUWfMBrXICl8gj4pB2RchjxhvYqZLjKSqSTBNboEu1w3sJKqCUrKGCgl/oFAoFAoFAoFAoKj3FpbdjlnfShE9wPDRZzRqC0JnFyB7eWIZjfJXnBSp9RuLsoROqY1OoKc8OysRclQD6w90RGO4yuZxgAiCNHhg9PGUtyvXhqT3s9ZDgTP5VAJaOBY3XHI0ydpVZ1doGzoHhxb2YIDUyBswzhl0am9pTivfsRvaZQAXbogmUGgfQKBQZ1W6+zGal+Lo0cYclpfijF8fy/RQwFtjkrCob10NjCn0od+YwkXR+6Vud1khciTU/MdzRqDBWNLubbsw0VaBQKBQfSpTJ1ic9GsTkqkiok1MqSqSgHp1Kc8Aij055BoRFHEnFCuEQBWuEQb3te3Kgzw+E1t5Bm8PudaTGLtgxFjxzluxIArT1Cf4541RRbGsc7UQgpArTgtmS1VizhpwjsG4+Vi+sQRBohUGehxVnq6bat85mEf1q+TUGhfQKBQKDOM4pn1f/ALcf2ojSD+tqahKDRzoFBQD3b/lrk2yPvy/0Ysk0F/ygUCg//9e/xQKBQKDOM4wr1abt+/aiIP8ArRU5oNHOgUCgre8WH6pN1D/axNPHo1Q2g7E4XH1RRoZ+/mf1sPUFQT/UCgUCgzv9kD5av90r7WJuXfrXbZQaIFAoM1DjF9aTPmXXNgXQ+klChvxtpdjKCUZcWtJZbqahyfm27M5rhHsiZwLLd1sHxEgaFKEs0ac+xz2sJt0BHYwYTYYf4svZZwVifGeFMcQ7VyzQDEcBiONoU1BwvBQdwi0JYUEcYkxlkmUkiYRxba3F9oIBRYRj5isG3PlYOxvLkG0b70Orv2TMO9u1QPLkG0b70Orv2TMO9u1QVG9+rdP0ha3taulnXfoCUZihWacTMLEhnC3I8HaIUMiUYgnaSeYSnEeOY5bJhOzylVOy9KtGcNMMhO1t4S7mWuLsg1CNG+paI6x9Kun7VJB7lgjuc8VQ/IRSAsfaDYHV7aSDJLFFQ+Y7XcYhJQK2tVyEMNlKMdgiFbkK4elaCl9xtPmC9JvsXYPQayZQWQtp31Vltp+wAaN/1nXHNB7/AKD9B1amx9bHJke21A8MzwgWNTu0OqNO4Njq2OCcxIvbXJArLOSLkC5IcMo4k0AizSx3CK17Xva4ZzchTz3hVd6MiRNhMmctsPWkoOuob0ohOZKTHJjwAxxay04g2soyRpcksgCeh581TnF1oSe2Ca5KLkhorxmSx6aRuPTGIvTZJIpLGNpksYkTKsIcWZ/jz6gTujK9NDglGYmXtjq2qijyDixCLNKMCIN72va9Bn2cHF5vTc385jR6MsloNC+gre8WH6pN1D/axNPHo1Q2g59wvSZOs2H9EKNYnJVJFROp5MqSqSgHp1Kc/WBqDKPTnkGhEUcScUK4RAFa4RBve17cqCvbvJ7TmetmvUS2bxm0IJ5hOO48/K3vOeHYs3GuUcw+md1BR0iUDiyU0AX/AExToVrkvLKMHZRc+4Dk5hKLuwmkLU2zzu6YQ3cNNxOUYOWkg2Z4MJvj+fcHKnUha9Y/lZ6QJpDyzXEItc941ltwGmsrqIoFjexPSnWCrSKCwBLhQKBQKBQKBQKCLzey9VG7jPsImavaOcaCEXgqfVWWfPY/8p/rOulWgt+0CgUGdduiPQtPfF96Qspyzs0kcns30WLUa1WSYBMljswRkYAWuxpnbE2Gma3lrXGjNte4S+wvzCPouAQaKNAoFAoPxGMBYBGGCCAsARDGMYrBAAAbdQhCELkEIQhtzve/gtagzv8AhQ+ead57c+1SR/qOhjzjnNfYKE5YBoRXz3qrhmRIx7qLKTugRzVjpWIoNrmWGAI79fptuoNEKgz1OK4KMb95Datfl4e5Ml4hiMrxWV3CnbrGM+qZ5WOoRKzbgIB4nJHEg069xWsWA0IhcrXteg0K6BQKBQZv/FHuKJbxA23qmSKSzz2jCuj5ucygXvcSNabrDzq7FpjudrWsYJtdE51uXP0w0P2CwaQFAoKDG6szLX7i8Ns5C3hLEeQ1aTXkyxplig9yjmRstSFzFYV7XtcwLa1m3AH5fHawfW0F+egUCg//0L/FAoFAoM4zjCvVpu379qIg/wCtFTmg0c6BQKCt7xYfqk3UP9rE08ejVDaDsThcfVFGhn7+Z/Ww9QVBP9QKBQKDO/2QPlq/3SvtYm5d+tdtlBogUHXOYMqwvBWJ8mZryO5hZoBiOAy7JM1dRCTA7hFoSwr5G+qS7q1CRMI4ttbjOzCM0sIx8g3FbnzsGd7w4ulZl3edyvXZuP6zsSwjMWNm11lL3fH+Voew5Gxs55hz9IXRxYmK0emra8ML61Yhxu0K06VOYmHduupazQXLEAnmF4n3Cd2svftPQB8E306+24oHuE7tZe/aegD4Jvp19txQPcJ3ay9+09AHwTfTr7big8H7nWxvoaz5oK1PY204aINJ+IdQCzGDxI8LzfD2nDEmOZ4RkqDjImkUjjbKoPD2aQIkE6c2EDEvCWaMBiFxNsIozwAuESfBfa1RZC0tZ40Jy10MFJ9Nk3tlHGjetGZY2+J8vLVZknaGtOIY+zTRDKiFYtWcwlcjpUVy673HcIXW6Cl9xtPmC9JvsXYPQayZQWQtp31Vltp+wAaN/wBZ1xzQe/6BQRibu22zAt0zRRkfTXJBNTJkABYZtgfIjgjCePHeYI8nUDjboM8KdSrIjshKOOZnwJABGmM7gouUHtwkiAFdPhadyufwh9n2yZrWA4wrUBpveZq26f0UvOAB6VssQXuarJWB1Kkw0dnB1xyeQoeI+IoxSWrjg1RZAgI2xLY0PG/Bxeb03N/OY0ejLJaDQvoK3vFh+qTdQ/2sTTx6NUNoOxOFx9UUaGfv5n9bD1BUE+Lk2tzy3L2h3QInVpdUSptdGtySkLm5yblxBiVagXolJZqZYiWJjRFmlGBEAwArhFa9r3tcM+rdb2qtSmxjqVJ3e9olQ4smCmh1OcM3YRbyFjux4nZ31wTGSNgfIyQeUZLtLsxUBLAoS3GFVElViTiDSSiUatvC2ZtK7tWnndo08pcq4qVExLKkSJbGvO2CXRzIVyzFcsVkD6DCx9CYyRQGRGJjjWR7KJLJWkljKNAnWp1SUgJVqBQKBQKBQKCLzey9VG7jPsImavaOcaCEXgqfVWWfPY/8p/rOulWgt+0CgUFInjKdEExk+K9OW5DihCv8cWmV3DjDLjuzE83RigMrkqN8xTNzFZRVjUjZCMpHKUIh3GLpVyhOIIQhCYO4WPtobcTg+5zoZxFqPYHRsFkMDQjg+oCJIjCAqoNnCMtyEmaNalCSEuyJsfzDinto9NtYxnc01/APrAAJOKBQKCBTiK9yqJbeG3blJGgkSRLqI1NxeW4P0/xwlQGz5ZdJmkLLPclkEWCcYQ2Yqij6JcFSMsabxZPbUpnLvYaDx9wjugmQaT9ux41AZDZDGPI2t+VM2UESBWj7m6I8Gw9rXM2FgOVh2uad44bvj7JEQ7C7MTXIEt7ACO5lxBasoKJfG0aepQqx/ob1hRVO4ko8ZTPI2F5o9toTwqGdZO0sbnWLnHvqS4FDSWjcIE/l2PFfp70qThCIBlw2MC3ht/asYlrk0YacdVMOdETmky/i6Nv0gAiumtZjn6RJZnyTE1ZKQ5QQkcYlPW1xblBQRiCA1NfpvcPK9w9iUCg+s44lOSaoUGlkEEFjOPPOGEokkkoNxmGmmDuEBZZYA3uIV72ta1ud6DIP3IdZDLrs3+vJ4hbgJ1xWDVZgHGGIHQu9htr1j3EMyh+PEsoYj7XFZSxzWRMDk9px8736XHpvYNw3AENfSgUHjHIW3po0yrqmx5rYn+C4/ItUmKUDI2Y/y+c9zFE+RxBHT3xQzJyWtrkiGMrQojZKu5XVITxDCouEdxBCCwQ9nUCgUH//0b/FAoFAoM4zjCvVpu379qIg/wCtFTmg0c6BQKCt7xYfqk3UP9rE08ejVDaDsThcfVFGhn7+Z/Ww9QVBP9QKBQKDO/2QPlq/3SvtYm5d+tdtlBogUFTPi/8AW5fTvtzsWmOMO4kOQNac5Lii0pKpAQuJwzjBQzzHJKoAgXupCS7Px8eZjgWsEChE5qixC6eoAg98cOPonFoh2odPUbfmnxLyZnVEo1M5TAamJSrgv2XEbavibWvKAaeaStjWK29gbVBZg7jArSnXuAq4rlACdSgUCgUGa++jFsYcVWS8mWFEtNequc99PGACtCx2wZrDdxp3UZlhhILDF8QZ/QDUXAVdQACaLAsG1zLdmENKCgpfcbT5gvSb7F2D0GsmUFkLad9VZbafsAGjf9Z1xzQe/wCgUCgpE8UvttZEx5Lsd73Gi26+IZx09PkGXahFUUsIt4Ghhrg2JcYZ3ISlFXsvVwkxOmYpEEdzAHsV0QzC7JkSwYg8M8FI9rJLq63A5G42JC4SDD8Ee1wUwBFJ7LHXJryuVWTliGYIsmx6gXQG4hXsHlbnf1Nw0XKCt7xYfqk3UP8AaxNPHo1Q2g7E4XH1RRoZ+/mf1sPUFQT/AFB/MemVmkrM7xyRtDY/x5/bF7K+sT0gSurM9MzqlNQujQ7ta4o9C5NjkhPGSeQcAZRxQxAGG4b3tcM8zdG2s9TGwbqna92raiOfCtNTdILK8uYjSCcnhvxGzPzolNkWPZy0lmjVS3TJODQAIIUmiErjSvu9hHFHkNzhQXFtrPdM06brenRuzbhJxCxzBjC3M+acLPDimUzbD02UphmianUJQE4niLvF05xzG+EklpXVKWL00hWQsRpgkwoFAoFAoFBF5vZeqjdxn2ETNXtHONBCLwVPqrLPnsf+U/1nXSrQW/aBQKDhGS8awLMePZrijKUUZZ1jjIsZeYbN4dIkgVzJJYxIEJza8NDkmFy60yxGoEC9w3CMF72EAQRWsKwZ3GdNFe5lwveqqZ6vtByN31Dbfc5VmrcjRxQ1u8iY2nHrcvcVyCB6iWhqGa9xhzgiNzO8QsgorgShEK4lIirKVbUoCwjou4sDau1OR9qT5lnD9o0ykamt4rwvMzY6PEJ78DwqPG1mGIs62LuDUAIrdBz0RHVZouq1klrWtcQSlLd4zaeQR68nP3ItEg22xIT+7ItS2JHGQ9AhdFg2iDfKlUsuda/qS7Iu0tbw3Da3hoIWNd/F57dunmPyBg0mlybWbmECY9KyDYGl6x/hBpdvAXZTJ8hS9sbn57RI+0scAuPNDkQv7O5PfknVY8ARS6BtovXrvjau2jc03lUkgh2n1CraHPH2B5G1ukMcsmxhlWeKUWxxDMcL7iccY6dbGCGe4rlYineSgPGYmEeYvPeCA0GUCBC1oUTY2Ikjc2tyROgb29AnJRoUCFGSBOkRIkicBZCVIlTlhAWWAIQAAG1rWta1rWD9ug8o64NHmJtfGlnMOk/NSIw6D5bjI2m7qjLLMeIhJUCkh4h06jwjbhAB+hsnQJXBOEV+yPERck6wyDTACDPn0oavNffCk6mZfpS1iYokmZtDmT5avkbA5RAfZMr+cXZGgNzHp3kryMliDJFjGnSgkUPdVCI0RhJATjUQwgWHhc/077/G0HqVjKCQxXXTgzHatUmJMWxLUFLm7T7K2daMBVzmlUiy0fFW50WpjTbF3Ma1TgjOHa9yDzQ26qDt3LW8htUYRbXFyyDuD6TCBNJdzV7HEc0wzJsyJD3QtcCwYHjJzl81PMUJDQDJAW3jGdYYezsK4rWuFYTV9vH6rN9mWv22vsnYwyFH8UTMJTFqT1mTtGphCJtxW8CVt0gTWGECpRjPHr+3WN7U1UaGXSROA1tQtZQhGlqQhw3o9FeJ9vXdO2g9JWGizj4lizTRpDSr5I4JiE77PJi7639RjzNJ9IrECMB4ryySLlCq5VhjKRECKSE3snTkgCGppQKCiDuXcWvqR0dbjOYNMmINMuE5VgnT3kIGOJuoyX5IabLmQnaPlpgzVxikjj8wbIlA2w5yNOTNN1TBILmpiALDL+6nuqcLx+Ppk3ZGgUIyE0JlqNpncQjUya0bkEgDilbpQzIntEmXgSnqkwFpCZcEJtizTAWHa/SIVuV7hy+gUH//0r/FAoFAoI4tYe0lt8a+cp4/zXq00/8AksZNxYwoYzBJN5K2bYL4hMjbIl0sRIvEbGuSIbH3PsZA5HqO0WJFBwuvoEO5dggsEjtAoFB5u1Y6RtPWuLCUi06ao8feShhuVuMddn+HeOubwrv7hFHtFImBR44cdyWJSpL3B5byTuglcWA3o6DAjBcQbh/R0uaXME6LsEwbTRpog3ka4Sxr45vGVCvHNMZj4i+PGYyGfyP4yOfSGUy1x8UZbKV6v3Vrz+x7fsiugkBZYA9AUCgUCgjvwftRaBNOGrDKWuHDGBfGbqizU45MdsmZP8lLNEi8crhmGXlTzIyjxlSvIr5jxm8cUrJCr6G9pSgScuyShJJvcu4SIUEbmtPaL29Nw/IEIyfrHwCdmiY44jdojC1azL2dYazMjBd6VyE9GCI46ybEIeuOXOq0QlSlSgOVKygFEnGGEEEllhI+SSSnJKTpyiyCCCwEkEEgCUSSSUGwCyiiwWCAsssAbWCG1rWta3K1B9lAoFAoI5tcG0tt77j8hgUs1nad0WYpLjJleI7CnsvI2YMcOLWxvq5K5OLUqUYmyDBBvqLv6MJxAHDvVkYzDrp+y7c/tAkIZ2tIxtLWyIBLRIWduRNaITk5uT04iSN6YpImEveXlWveHZbckkPaqVZ56k8fMZpgxiEK4eQNbW3po/3GIFE8Y6ysQ+TFB4NL7TyLMnj/AMoY98S5XZmc4/Z18UsWTWDu633aHhST2ClQcm9zOvs+sIBBD0hifFsEwdizGmFMWsXjXxlh/H8NxbjqM+Kbw9+N2CY/jrbE4ixeLMicHeQO/iRH2hOn70uVqVh/Z9ZxphghDEHYFAoFB/Dk0aj00jchh0uZWySRSWMbtGpPHXpGQ4sz/Hn1Aoa3pld29UAxMvbHVtVGkHkmBEWaUYIIrXte9qCP7RBtJbfG3DJ51MtGOn/yG5JkphbIzNXHyVs25D8WmRmcDXVtRdzyrkicoG7uy84RnaJCiDh8+kQxB5WsEjtB5u1Y6RtPWuLCUi06ao8feShhuVuMddn+HeOubwrv7hFHtFImBR44cdyWJSpL3B5byTuglcWA3o6DAjBcQbh/R0uaXME6LsEwbTRpog3ka4Sxr45vGVCvHNMZj4i+PGYyGfyP4yOfSGUy1x8UZbKV6v3Vrz+x7fsiugkBZYA9AUCg/mPTKzSVmd45I2hsf48/ti9lfWJ6QJXVmemZ1SmoXRod2tcUehcmxyQnjJPIOAMo4oYgDDcN72uEZOlLZb21tDuaVmoPSfp5c8KZTckD40ujrF88akFEbdmWRG94cmF3xw+5ed8ausfArsWelQKGg1G3qSCDkpZJpBIywlJoFAoFAoFB1dmzDGNNReIsjYIzJG/HjirLUQe4HkGK+LD/AB7xwRSRIzG94avFyLOjHI2rviQ4QO3RLEykvnzAYEXK9g6R0VaCtJ23bix/wpo6xT5D+MpRkB1yk+xnx85JyB36dvcdikTc33xZylMJtIE3eY/CGtP3UlWWjB3XrAUEww0Zgev6BQKBQfWcSSoJNTqCizyDyxknkHACaScSaG4DCjSx2EAwswAr2EG9r2va/K9BC5qm4ejaI1cvzhMMiaQYdDZy6q1C9xmWDnWQ4RcXFettzXODuy47c2SFvrmuP5HHK17UqVGH9RgjLiMMuMI/knB2bQiZzLXnHaql6UCgZ4mVXmpkA2GlCuK9kZhqHHKJ5smLsK1rXArCdyDbmO9+d7hKPpE2OtrHRA8NktwNpCx2RkFoMEpbcl5IMfMwz5rXiMJHZzj7/k90lQog4lhThAA1mLbhALuOweXandYSw0CgUCg6szLg7DeorH7zirPOLYDmLG8gDazvCMkRVmmEbVmlgNLTrfEt8RrEydzQ9sISZWVYClKZfrKMAO1hWCvdljhJdmrJcgVP7BjPM2FgrFA1ahixPmyReN+553WI/uqHJiTJRzamNOHcYU6U0hOT4AElllWsXYP1MY8I3s2Y+fiXqQ49zjmIhOcUeVH8nZwfyGG4ybCuAJxOMEGNXFWTcy4RCLOUmFj6LBEG4LjAILCOD8AYQ00Y+asU6fcT4/wzjhk6xN0NxxFmiJsRag2we8rz0bQlTBXOq0QbDULFFzVSkzmM0wYr3vcPIGqbaS2+NauoDHGqTU1p/wDJLztiRhiEZx7OfJWzbDfG+yQKayHIkTReNnH+SIrDnXxKmMqXrO0XN6k4/vHZHDMIAWWAJHaBQRKajtjLa41Z6lkerXPOlqPzPNIVbO4SF1Klc8jsbn7hHUyVIwL8iwmNSZoikzVtydCQUMSxIPv6cgBC7vScNiqCWckklOSUnTlFkEEFgJIIJAEokkkoNgFlFFgsEBZZYA2sENrWta1uVqD7KBQf/9O/xQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQf//Uv8UCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUH//1b/FAoOFZKmifG+Op/kRYhOc0kChUqmiptTGgIUOCeLMS58PQpzzQjKJOVlIblgGK1whEK172vagpgeXd9Jvrkuoj4HONf5bQPLu+k31yXUR8DnGv8toHl3fSb65LqI+BzjX+W0Fz/Gs0T5Ix1AMiI0JzYknsKis0Stqk0B6hvTyliQvhCE88oICjjkhS6xYhhtYIhBve1rWoP6MwmUQx5Fn6cT+VxuDQqKtip6k8wmD41xmLRxmQl3NWu79IHpUiaWdsRlWuI09QcWUWG3MQrWoKs2rvjAts3T++ukPwYxZZ1gSJsMUpzH/AB02N8GxMJWnIBe6cmeT05E/OhY1pnZWVNsfcEJgSzDSzzAdl2oR3x/jj4EpkByaU7b8vZosFQMKd5j+qJmksgNSWVWAWedGnHBETbk6gaLmYIoLsYEJvuXYwQfcywTwbf8AxIu2FuCyRkxrFclSLAmaZAYUjZMT6jmhqgrjJnQVhhE3w+aND9J8ayFaoPB0o0XiwneFthg7ND19ZYAntoFBUz1u8Wbpx0Qar85aTpfpOzZNZLg2anwt2lcbmEERsb4oJQIXEK5uSuYi16ckZK8NrgNt1WEG/hvble4eV/Lu+k31yXUR8DnGv8toPQWFuM52y56/NzDlnFWqTA5C4RAD5g7Q2HZChLN1Wv3kx1HA5s4z0ZJQrh6Loo8tGYHqvcAL2tYQWjMBaicGap8YsWZ9OmVoRmXF0k7YDTNIC+o35nMVpeiy9pWiTDuoaH5rMMsWsb1hZC5Gb7lnlFjtcNg7moFB531a51dtMOmvNGodmxbJs0qMMQN4yKuxnDFyFvlcnj0XABzlQI8a4lHJlDq0xghYuJS9IjVo0vdyvc00FBW90Q8W5pG1marcJ6WR6eMu4YXZxl4IFHshTeVwZxi7bLnVvXXiDO5Jmk+zhcyYSYlKzJRF2F0rV5Nx2sDqEELZVB+IxgLAIwwQQFgCIYxjFYIAADbqEIQhcghCENud738FrUFNma8ZnpGasxSrE+NdJOf8zkN2SHnHsElsJksGuiyrZJJVEcjcgh7MaM13MRTe5ZKhuTjD3kZaksIgWMvcNguERNyenmKxl4kseFEZE7R9mcn+KDc0z0OMPS5uTKnWPCeEZRCR2EyrjTE11JQAFn3K6whsEVrWD65hMohjyLP04n8rjcGhUVbFT1J5hMHxrjMWjjMhLuatd36QPSpE0s7YjKtcRp6g4sosNuYhWtQVZtXfGBbZun99dIfgxiyzrAkTYYpTmP8Ajpsb4NiYStOQC905M8npyJ+dCxrTOysqbY+4ITAlmGlnmA7LtQjvj/HHwJTIDk0p235ezRYKgYU7zH9UTNJZAaksqsAs86NOOCIm3J1A0XMwRQXYwITfcuxgg+5lgng2/wDiRdsLcFkjJjWK5KkWBM0yAwpGyYn1HNDVBXGTOgrDCJvh80aH6T41kK1QeDpRovFhO8LbDB2aHr6ywBPbQKCpnrd4s3Tjog1X5y0nS/SdmyayXBs1PhbtK43MIIjY3xQSgQuIVzclcxFr05IyV4bXAbbqsIN/De3K9wtL41mifJGOoBkRGhObEk9hUVmiVtUmgPUN6eUsSF8IQnnlBAUcckKXWLEMNrBEIN72ta1BzWggn3iN9nEOzrJ8FRjJ+C8kZhPzswzt+Z1UDf4wzEsRMEcIw3rCHIEhEEZ5i4cnLEVcrwBsULq9Tag9UbUe5fBd1zTA4aocd4zluKI6hynLMW2jE0dmd4ejV0TZ4s7KXW6ljt3EtIqtKAlll8xDt2N73v6da1g6u3gd4HGmz7jTD+Tcm4fnOX23L85eoI3N0EemBmXM65mYPHANatHIOkg9IenCIu1ixWGEdreC9r3vYIDPLu+k31yXUR8DnGv8toORRrjbdEKpeAuYaQNVTE13MIsYsjTjiOVrwkiHeykYG10mkMTmGFF8rgDdUGxgvBcQLeG4WANvneh289zLqZtMubkg8oJkB7m54LyQ3jx/mRChSEFKF65HE3Q81LL2xrKOBdWtj6x3QpLisE04Ar2tcJUqBQKBQKBQKBQKBQKBQKBQRq7jm67pG2wIhEHjUNIZC9z/ACc43ZsRYKxe1IpTmHJ7kFQnRmij0eWurI1NrIkVqyij3N1XIG8JxgCAGmKTCiBh7RwJlMrOeC8LZsIZRxonMWJsc5TJjpjkU8mMBWQYezy0tlG7kJkRDqNqA72IupASUA+5fXYAbCsGwcb0w54adSmEYblpvaz446uQpDFsgQpbc8TnjjLuN5Q845zHjB4EoTIzTHbG2UYq7sig3sgFqDENzSuoowAhB37QKBQKBQKBQKBQKBQKD//Wv8UCg6I1S+Zk1GfaiMveh/IaDGW2j9PGLNWW5JpD05ZuZVsixRlvKqeLThkbnp1jq1xZjGJ6WiTpntkVInVuM7yjLF2hBoB+Dlz5Xva4aT3lTzZN9d4yJ8GHzV/PlQPKnmyb67xkT4MPmr+fKgsJsTPFcWwJmYEahMwQjHMQbmdKqeHKwEjLFYizEoiFDo7uR1rATNrQ32EepPMtawQCGMXqb0GUBv073GYt1vUW64EwG9zNHoth0zTRDEeLI0FfdTn+XNzyY2tuVpWxNiYDrJHGVOoyxRlmUAO8TEl09wEAcDlIhBNdthcG/HpNj2KZg3NsiTtgk8lbkL6k0wYfcWhgVRFMrKCoIa8tZIXNshULX4ac61ljUwkovE48HT4qKL9ZYAmgkHCS7LryxrGluxDmKJL1SbsCJPH8/ZDUvjcb09PfEaeVL5NGhqLX8PJQ3Hk8/lzl4KCnxvZ8M3mPbJibnqUwBNHzUbpFRLyyZY5OrKkQZZwaSvVkIWhRkZIy2LZJZElyxSWR44m1M3lEKjAlKkCQAiTjwm34V7fenOaHpl2zdYczUSubIY6vUaVMvyp0MVSaUtcYQGODphCYOq0Zil+eWSPJD10eXnjEpNQI1CE0YxFIgiC9hQYx3EBerl9wb7Xus9peN0F9rBPCzbM06whhubSPT/kBVIZjirHkpflROf8AMiQlS8yGIs7s6HlJU8vLTpizlysYglgCEALX5Bta1rWoPGO5VwgGkJw0/ZCyHt8Lcn4uzzAIu7yqM4uk80cMj45yrZhbTHFXCgikaNwm8emMgLRiKaVpTocgCtNsSoS9kbZQlCs7wyu4zkzRZuR4Yw2CSuJ+n7WLkCK4KyfAFCw3xCHM5wtDFsTZBb0ogHp26TRqcOqJOaqCANz2dWqTmCtYRZhIa49AoPxGABgBFmACMsYRAGAYbCAMArdIgCCLmEQRBvyva/gvagx59/jbxf8Aa03LJikxmkXw/DWVne2orS6/sBw24MXanN+MXucOZFrf2QmdzxBPU56FEUEzvRLUBsVCva6kF7hpv7PGvtn3J9vrA2pktSmvP1bDbH+cmkixYLsWb4EQkaJ6XdOSUUSjRSQ65D+3kh6uyanhKEV+uwrWDwbxOe4uLQXttzKKQiReIufdXBjpgfFlkZxhLyzxZxbgCzNPkAyTU6hL42IOvs3J1ZJljkTy+txobXsG97BUJ4SHbVI1X62nTV/kyOhcsK6KhNEhjhbin62yT6jnyxxuNUhdhiKsrDjZCjUyY4RQhiSOadosaC5anlcNRZycm5mbl7u7r0TU0tSJU5Ojo5KiELc2tyEgxStXr1qkwpMjRI0xQjDTTBBAWANxCva1r3sGS9v073GYt1vUW64EwG9zNHoth0zTRDEeLI0FfdTn+XNzyY2tuVpWxNiYDrJHGVOoyxRlmUAO8TEl09wEAcDlIhBNdthcG/HpNj2KZg3NsiTtgk8lbkL6k0wYfcWhgVRFMrKCoIa8tZIXNshULX4ac61ljUwkovE48HT4qKL9ZYAmgkHCS7LryxrGluxDmKJL1SbsCJPH8/ZDUvjcb09PfEaeVL5NGhqLX8PJQ3Hk8/lzl4KCnxvZ8M3mPbJibnqUwBNHzUbpFRLyyZY5OrKkQZZwaSvVkIWhRkZIy2LZJZElyxSWR44m1M3lEKjAlKkCQAiTjwm34V7fenOaHpl2zdYczUSubIY6vUaVMvyp0MVSaUtcYQGODphCYOq0Zil+eWSPJD10eXnjEpNQI1CE0YxFIgiC9hQYx3EBerl9wb7Xus9peN0Gv1pa8zJpz+1EYh9D+PUHe9Bnf8cV8rZ28PtXeon2pcTUEw/Bv+qjX72LvM3tHYloPInG7+ZN0S+xETn0NTaCLjhhNm/QTuZ6f9Tk91e4yk07k2M8xReIRFYw5MnsFJQsTpCi3lYmPRxF9aUq4wbhe47GmhGYG3ptr8vBQWTJvwjWzNKo05MkfxpmzGjstJMLSTGHZ4mjk/tBoiTSy1CJFkMc5ih4ijB2H0qW08NxAta9um4rXDPf3G9Fee9kHcVMxhFcqvJMtxqoiObtOWd4oBTFX55hbsuXjh0uKSWNPs1vzU8sa9pdEwTFCMa5uUlgEcmHa4w1h9qfWUp3AdvTSzq2dUaJvlGVsdiBPUbaG5TaTkqCSF7xvkkxsTXLLEialk6iDgekIv1XJSmlg6zLWsYIJCKBQKBQKBQKBQKBQKCK/VDr8kwNRLXt9aHmKLZc1svMcTTTJr1JzVKrCWjDEi4SUorLOoE1mXInZ9k7p4oJ7xmBNyhI7v4jyj1KlsbzCVZ4e08GYQZcCRZ5Pd5xKsmZBk5pcjy7m/JzmkUTCfPiNMbcxwXARkN0Xg0MZQGn+JEaYkjZGo+nNNCiSE3NUGGhkj5m1WzbdV3jJ/qMf3VyXNg3jNk4wazK1FzSYRinTTjLJmVMLRlChVFDRXCgRQJMucE1iAEObsrWGmE9Ss21w0ceHV1LM+pfalwStSzoudyPCslyxp5mB4TnBUbHr4zyK/hxjHDli4oJSksrALzD1qbuphyUpEtJKCIIixlFh5knWo0jZa3SpWxZoMKjO2luw5AvlWHZSUkiDE9MGvg1maGDMLTNHe5rk4tUJ1F+JrZIlK9xMTtje6KlB6QpM3t76qAFl+gUCgUCgUCgUCgUCgUH/9e/xQKDojVL5mTUZ9qIy96H8hoMcfZOynjjCW6voiytl2bRvHGNYPmRM9TCcS91SskajbSCOv6cTg8Oq0wpKhSWPUAB1jFa3UO1vW0GrZ7jZbRvv4zpE9nVDv5o0Ho7Tlry0YavXmSR3S7qdwvnt8hzYjepU1YtnbJLl0faXBUNChcHVO1KVA0aRWsLEWWMdrWEO17W9RQRk8TDqTftNGzjqndImvE2SvMKSJ6eGhcBTZMYU25dkSRjn5RPSYUecctxaS+kAsVfrAM2xl7XAAdrhSL4RfR/GNSW6GLLE7aEjzF9IOLHXNLIjXFd5SDy04vzJC8aKDU97hL7aPXeXN8Rm36rkOLQmGEPVawgBqv0Cg4lPYJDsowaY40yHHWyXwLIMXfoVNYq9EWVNEkikoa1TJIGJzT8w9sgdWpaaQaHna9wDvyva/hsGJVlFone2BuWz1nx88qLzfQ/q/kKaCvolobDe/IVykqvFnBeegsTYaKVNDKQJYRcsHWnVGEmlB5jKsG29DZU0zuIRSbsIjhscyjbHKmUaksBSgbTIWtK7twjygGHALOEjWAuINhitYXO1r39TcMbLiAvVy+4N9r3We0vG6DX60teZk05/aiMQ+h/HqDpvcD154F26tNOQ9ROdZpH2AiOxt8PgMOXOaMqUZVnaZD8Y/AoOxDVJ3GQO7u7KE5R3d7XLQpjBqlRhCYow4AZEuyxp3l2p/dR0M4ziSBxVhb9RGN8ny9W3E9QmTHeHZGgyfPHc5UYUckbuyjUVPJTnHhEXdaeQVYJgzAFjDa1oFAoK+XEmbZ4NxXbxlrhCGUThqJ0rhfs44UujTWUO0jRNzPzyhi1Lbq7QwM/ijaA5KSXbtD31obA87A67CCpJwe+4mDT5rGmOh3IchEhxfrAQAcMdFLT7BbGbUVCUBqhoIKubYJKAWSoMStbTB9dhrHNuaEwQiEMHIPDXETa45TudbrL/jjDt1c9x3hGSJdJ+nKORexjn495aGTgZ5g/sJJZRYXVzyJlNSYjQnE9ZaxrRNvZiGG1hiDSs2l9AsZ21dBuDdLTSQ3Gy9iYQy3NEibwAuGYZsmJKZzyE+CUhvca5EhX2LaWwwd7jCzNiMu/vHag8a8TDqTftNGzjqndImvE2SvMKSJ6eGhcBTZMYU25dkSRjn5RPSYUecctxaS+kAsVfrAM2xl7XAAdrhSL4RfR/GNSW6GLLE7aEjzF9IOLHXNLIjXFd5SDy04vzJC8aKDU97hL7aPXeXN8Rm36rkOLQmGEPVawgBqv0Cg4lPYJDsowaY40yHHWyXwLIMXfoVNYq9EWVNEkikoa1TJIGJzT8w9sgdWpaaQaHna9wDvyva/hsGJVlFone2BuWz1nx88qLzfQ/q/kKaCvolobDe/IVykqvFnBeegsTYaKVNDKQJYRcsHWnVGEmlB5jKsG29DZU0zuIRSbsIjhscyjbHKmUaksBSgbTIWtK7twjygGHALOEjWAuINhitYXO1r39TcMbLiAvVy+4N9r3We0vG6DX60teZk05/aiMQ+h/HqDvegzv+OK+Vs7eH2rvUT7UuJqCYfg3/VRr97F3mb2jsS0HkTjd/Mm6JfYiJz6GptA4IjzJutr2IiDehqVQXZ3JybmZuXu7uvRNTS1IlTk6OjkqIQtza3ISDFK1evWqTCkyNEjTFCMNNMEEBYA3EK9rWvewZIfFFa4sLa6N0NxkuAZK2TrHWBcJwrTenyCwKSl0YnL/EZpkueyh7izoQeemeo+hfsmntZC4j3SrvE4R6cRqcwo80NA/hztO8u0zbOWjaDz5A4tEylkUlmZXhncye6qmlHmefyjI8RQGIRlFqm9QVBZA13UkKOZ5SwR1h2B4Ciwm6oFAoFAoFAoFAoFBAXvg7scs0RRjGOk3SC0JMm7lOsp2boDpwx4nA3OY4Ckk7vaLF5glLY5e7OEkp5NEjYCHQZLescij1Si5qBrcChB7I2s9u2O7dWnO0KdZGblbUnlp8Py1q71EPSte9y7OOdpJYxbJXxdJHwot/XRRgVrDkbEnUBKuWl7RUaVZeuXnHh3BuNTBXjzb113z9vGoLXwbRnqgmCIxIIoKotXGcIzh6TDTCOCMkKgJyINwXHa4bC5c7XtQY1221luFYN166S8mZNsX5FzLm+ENeVTDRlllp8VzFzBCslrBXNDcofcoNIl5tgCuEJlwdNxgtfrCForZT1vrtkPc41EbeWsKTJYpgie5Qa8Hy2fTJeaysGNcmwhOsQabc9mmj7vF41ibO+H1iBG8LzLDuSWU2PDktQtyMdjQvt65NE2B9wrTRkTSzqKjxjzAJ8iLGkd2y6NNL4DLm24zozkOAvCxGvLY5jF1w7mJzhEnJ1BAzkaslQhUqUxwUt8U7m2vnhms3sO35uRxWT6tNCAkqkvSzqFiQLpp03YraljelRWx0skTgNpkrbBm88CB2x09OSZxixylLZvd7sYWsLmF1bSLrd0pa8MYp8vaS84QjNELvcgp2FG15ieTQ9wUiVWTs2QIM8ENs0x++KAojDSUbygRKFCewTygjIGWYIPVVAoFAoFAoFAoFAoP//Qv8UCg6I1S+Zk1GfaiMveh/IaDEq0O6VH/XBqzwXpNi8saIK/5zmpMLa5c/oVrmzsKg1uXuPfl6BuGWtVEhLbxB6CxWFcQreHlzoLbPlITU36/Pgj2WWQP5p0E+uwdsHZZ2ecs6gMh5D1AY7zKhzLjuLQtvb4XFpLHVbIrjslUPg1iwb4oUkqkyolTcFrAuEQBB9ba/gD9fi+IQ7yzZxlL82lmDR4y1EYLm8gEAntQktC9yfsbkmHD7Uvu5d37IKEFh8h8xiCDp9O6ghXj4JScx1r1qav8eLlnYSaZaZmOTx9MPswFLm6CZOYUMhAWYM0IxrSBzhEYAoARXESE0d+Vi78w0oqBQKDFB3mckt2ad2TX/NIwItya3LVVlOMMahtAM4l4TQiSqMfoXBBYBqkSot4DGwnlCDf3NsbYQQhsKwAhs04JizvB8IYbhUgKLIfofirHkWeyCTO2JJd4/EWdpciijekPallrEg7BFyt1Wtz5UGPHxAXq5fcG+17rPaXjdB3nlDbJ4gvT3plc9U8+j2pCLacIXj+PT1wlsf1hwOUBY8dOxTQBneyoDA89P8AOS2VEgdk5qgJLTfxMRBMPUhITkHDLCOrSRp7zTue6vMXacB54jLblfL61RH4zkDUrPpqoZFCxpaFToRHRSMpnm72a8uKBtMIaUVyghWrOySFjCacUEQameyvsPYB2gotIJUhkyjNWqTJUdRx3JGa3NoAxN7bHQLEzufAMZRrvTifHIga8JE56049SeueFCJOcdcksohKnCeCgUCgUGR1xGW3w97XW5qfkXBpbvjzEGe3MGpPTjIYosXMqjHU6bH5Ivn8Si70jUkrWl3xtkQZDq2d1EVdtanhrAWLrLvewe9OD621DM/aqJRuBZHYy1eJ9JihVF8WBWlhNSSHUhI2NKaBYWUIQyjy8VQJ9u4jCYCwiXV4alJIusgXINNGgq88XxCHeWbOMpfm0swaPGWojBc3kAgE9qEloXuT9jckw4fal93Lu/ZBQgsPkPmMQQdPp3UEK8fBKTmOtetTV/jxcs7CTTLTMxyePph9mApc3QTJzChkICzBmhGNaQOcIjAFACK4iQmjvysXfmGlFQKBQYoO8zkluzTuya/5pGBFuTW5aqspxhjUNoBnEvCaESVRj9C4ILANUiVFvAY2E8oQb+5tjbCCENhWAENmnBMWd4PhDDcKkBRZD9D8VY8iz2QSZ2xJLvH4iztLkUUb0h7UstYkHYIuVuq1ufKgx4+IC9XL7g32vdZ7S8boNfrS15mTTn9qIxD6H8eoO96DO/44r5Wzt4fau9RPtS4moJh+Df8AVRr97F3mb2jsS0HkTjd/Mm6JfYiJz6GptBTo25tvfdv1lQjIsq25Yvkx+g8OlTZH8jHwTUnjrByQiVLGizi2FL2ma5fxsrfFF2gXMKgkhSWWG/RcwIvTaDyXqmcNa2J8j5I0vas55nFHPMXS1VGchYuyJlSQzNvaZK0fIo7WtKJDFH1IanUhPQuKE5UhWozwKEp5pBoDBBcd2OeFfxnk+P4I126xs2Y3zriKXsMSy3inBOGTXt3h0sJV9g7tybNUwkrNG1gy2RYTdI8RRE3XsJaUalVrugo9KaGhAAACwALLAEBYAhAAAA2CAAA26QgAEPIIQhDbla1vBa1B+VAoFAoFAoFAoFB531aanMYaMtNmZtUeZHPxLxzhWDukyfhAEEKx1UEdkhj8WaLDtcBsgmUlWo2luLFyCavWkgve1hc7BUP4anEWT9xfWPq136NWpQ3OYvs0k2F9MTEqGYpZ4ABWyI080UQyypKmUEMOOMYvDdCGRUVe4FhS9973Ya2wzaC7xQVM+KQ3fcI6YtH+X9BcClzbLtWWpiEggciiDIp77bEOHZl7lzOSz9Ql5pmt2l8SLPbGloMNAvOA5BcBld0LB3gMtOgtHMWOl2+nouic+wyFqkG7RoMxMxYhzXhJYajIedfOjmKCSt+OMjMCc1c0myfL2H0BRbS79mI13XdiiUWWFLzGMmwemdnzicMzaAWaOaXdakan2fNKEDNOh0fk4+lRqh0ro0Cm7alxzJEr8YzEZNx/D3AmyFuSuA25e2oDgp0SuxLenjKMLykzje2vvsaMXaNFSTHGqnTrN+7nN8ohjnZLOcUTwluLXM761GLUaWc4Xy9GkboAwSJ0RIV/c1Q0biiPb1ilIoDOJ3DNrzcd4dzUY0ahtO+V8klYUcXcaLE+rfEhy9kCQUa4EKwYk1AR5FdW0Mr4t7qQIbW7lLIvLUwLiS3UDIcEDeFhDah4wmCZAHGsJ7o0fbcYTA8aRoatVuO2ZV5GT4d3cCcg/L+PEAVzpj9yWKiLXPeGMKxkMUK+ZjezIyBnXC8JFJZFp3GWCaweSsEyhsrZ2+QxaWxR5bpDGZKwOyUpc1PjA/NClY1PLO5ojgHJ1Kc0wk4oYRgEIN7XuH9+gUCgUCgUCgUH/9G/xQKDojVL5mTUZ9qIy96H8hoMgXh/fVy+3z9r3R+0vJKDZxoFB5d1r6WoZra0magNKM/M7pG854ykcHE7hICqPjL6rTd7iEyRph3CWocYVLkaF2TFj5ljUIgWHa4b3tcMf3AeUNTmxVujtMllcQMbcxaUcou8Pyfj9eapTNGQYC7JFDDLWpvX9JQFkdyHAHi6+Pu1izU/uoQuJYDbAAEQa7GhrX3pe3EsIsGdtL+SGqZx5yRIbyWLmqEaSf40kClKA9XDsjxQCpQtjUibTbiLvYVzEisIO2RnqEwyzhh7MoK6m/fvnYc2yMDzPFGNpi0S7XRk2JOjFjHH8fcUbg4YgC/tx6MjMmTAJzTbxtBHi1HemVAoDZW+OBZQSyu5gVqU4UO+HO23JduObjeP5VLWhzd8Aaa5Qw561AyxyLOWt7y4sjuN8gGOF65VcQXJ3ylNWsAFZAjLHjY0zmote4ybWEGvfQYx3EBerl9wb7Xus9peN0Gu5gOLx2b6PcLQuXsrdJInL9NWOYvKI68JS1rS/R1/xcztL2yuiM6wiVbc6Nqs0g8odrhMKGIN/BegyGt3vQBkTaA3GJZjCIOMiZIc3SJozrpMyUmWqQPBmOlb+e7QVamfQ9movM8ZSJoNZlyjkUaNyabqwACSeQIYahGyfuaxrdN0LY8zmNW3Jc1xAtNjPUjE0l0ac1jy5Hm1Fdzf0bUlvbuEUyIjNKe2m1g9kSSrMR2GM5Gf0hLlQKBQKCgHxznzy6+/2f4Eig9/8FT6qyz57H/lP9Z10q0Fv2g8u619LUM1taTNQGlGfmd0jec8ZSODidwkBVHxl9Vpu9xCZI0w7hLUOMKlyNC7Jix8yxqEQLDtcN72uGP7gPKGpzYq3R2mSyuIGNuYtKOUXeH5Px+vNUpmjIMBdkihhlrU3r+koCyO5DgDxdfH3axZqf3UIXEsBtgACINdjQ1r70vbiWEWDO2l/JDVM485IkN5LFzVCNJP8aSBSlAerh2R4oBUoWxqRNptxF3sK5iRWEHbIz1CYZZww9mUFdTfv3zsObZGB5nijG0xaJdroybEnRixjj+PuKNwcMQBf249GRmTJgE5pt42gjxajvTKgUBsrfHAsoJZXcwK1KcKHfDnbbku3HNxvH8qlrQ5u+ANNcoYc9agZY5FnLW95cWR3G+QDHC9cquILk75SmrWACsgRljxsaZzUWvcZNrCDXvoMi/imtN0kwDvGagJM4IFBMQ1HssAzzAXEwtRchwRPUTbYhMSgqTbjKGob8jw14BcoA79knGRe4QhGC1Boi7Fmv8AxZr926tPEpikpZVmVsTYugWINQEGKcEd5JD8kwKNIYqvdnJjAZdY3R3IPiIJ6ZTRBGSYjVdjY0Z6ZQEATF0GVBxZuv3F2szcEiWM8IyponWONJGOVmNHCZx5zs7x1+yzJpCe/wCSS484JjjGte2RwhG0tBqhPYVjHFvV2sYYUAm9gu4cM1pylumzZx0uM87RK2qV5XDN8+LGZYlEkOa2PKsrcXiAhEE0ohSMTrjclncB9qCwizVgirdQAAEIIeuN38ybol9iInPoam0DgiPMm62vYiIN6GpVB13xiu1h47YbFt0jDsd7SRQBMwYu1Vom0nmc6QVSsKacW5YUEFgBY1REHlaCOuh97mqDEC9rv0gTNxwwh5m4PfdcBApw/wC11mqSdjEsluLxkLSo5uytOSiYci2THueRMUFKVQwiLTZAQpfFhoThEAoLukXFgCNS6AtcNFGgUCgUCgUCgUCgUFBvjTtdTmjR6btuSDO6ku0mIBqTzchbjRdTk3kObxDMKxZb3YNxKCDXttf3VShMF7zJWtR2d72JHYLVGlWHYH2etrbAsGzvO4XhnG2mDBsVT5emz862KjgMmP3xkOUXJuET3tW8OE3zBJnQ5ub0IFSxcqXFp0pZxoywCCmzuwcYHkDJZMnwjtgMLtieEqgqmd01TT1rILyu/Jb3sSoUYnhJ5ixtxwhVhCZYh1dbLXsac4JhSVoVl2EEKQsmk0kmkhe5dMZC+SyVyV0Wvkjk8mdl79IZA9OagxW5O729OihU5Oro4KjRGnqDzTDTTBXEIV73ve4fw6Du7TlqNzTpKzTAdQmnufPWNctY1einuKypkNBYwkywBELmt0QnhNb3yOvjeaajcW5YUcicERxhB5YyhiDcLkEERbenE5x/vqFZDdvze5j0VNVOi5E3A8hTV6ezsZid6cV0eH2wZQieUljAOae9lErZm00fagkjUjMBQQAPzFuYbF2r1WXGFuQ9IepFjKESe1MCzxfxVnqBjcLBQPkNC4kPEEzZjR0VgCM5mcyV5ja4kgNCAtcSamagvZbTHEUaQt3mKG6ONbWPsZ4o1HZFavGU54nl6MiQ6cdTqN4RgSr2fH9psY8WQvrmr7Qu8Lfzlio0sxPZvXuxolIEgVwN/wB4aJ80KpJZrD0NoJHOdIJaxY8ZGxUqUL5JOdMyJUcaou4pHZUNU8TfCraIfYBcFhh70xkWK8Ujlxdj3MIeENjzf1zttS5HZMeTxdJ8waGZS8CLyJhUSwC94xwJ2WdsvyZggbqqTpWCVtyk4xUuZBHp2WSljOKUXSrRpnVCGtDiTLON88YxgmZsPzBnn+L8mxdomcFmTCcYc1SCOPiQtY3L09jyiFaYwRRnScnUFFKUpwRknFlmgGAIdiUCgUCgUCgUH//Sv8UCg6X1INTm+6d89MjI2r3h5eML5Samhoakahwc3VzcIO+pEDa2oEhZytcvXKjgFEklAEYaYOwQ2ve9rXDLE2PtuHcNxNuyaGcjZU0G6zsaY9iWaErrK55kDS7nCGwyMNgY5ICBOUhlEjgzaxsqAJ5wAXOUnlF2EMNufO9rXDWjoFAoILt5rYj04bu0MbX92dBYW1TQRoG143z8xMxDvdWzgNUKyoFlKO9u3jmkGusVGmpblqkrk0KjRHJT7kmK0asM+XM+xzvobY+TXCZYlxTqCczWUSxKw6hNBMoncsPcmUAwGHuBF8SmtuZYi2XsUEZwXlna+nouO9hADYdw4s5aqeJIywhU4mFPt2WTjPLVM7hFoxHNSCeUriXNUVZU1up0UYEkrcS1ZvJPchQaZa5Jgk9g9kYMsQewNC3ClbmusGat001XITNIOKnlxMeZdMcur00rzlIyTjgHLvEHFiF4UvpUicTzRWGdKVbHYq3WfyUCCAk4NIrQloL02bcun+O6ctMMKDFoY0HGuz8+OJpLlNshy5aWUW6zfIEjCmSnP8kcQEFl2F0Fp0iUopKlKISkkkgD2VQZLm+Dtw7huWd2TXNkbFeg3WdkvHstzQqdYpPMf6Xc4TKGSdsFHI+QFyj0ojkGcmN6QCPJGCxyY8wu4gCtz52vawanem9qc2LTvgVke21ezvLPhfFrU7tDqjUN7m1ObfB2JIvbXJArLJVoV6FUSMo4k0ADCjAXCK1r2vawQl8STtWKdyzQo5PGLIz4t6qdL5jzlLB6ZvQ3VSCcsxqIgOTsNN9ygGqjlE8Y2whW2JywCGqkLO3EcyyzjR2Cofw77buq7Yuu2OrJ5t5bg6DS7qIMY8U6hkZukHUOQzx5KocTC4NmFWA3GwwBMxS9upx6owPuZ4hLXIsuwjDC7WDUMoFAoFBSC4ynSdqn1Qe4cfpNGmnP+ojxj+lfePXyC8N5Fy34z/HN6S943PHT4wI5IPG/44PG+v7j3vse99yUdl1diZ0h7g4RTT1n3TXtt5tguovB+YMAzZ21v5JljXDs140mmK5U5RVdgbTUzoZM3x6dMrE7LI+sdmJclKWFkiTGKUR5QR3GSYEIWnaBQQXbzWxHpw3doY2v7s6CwtqmgjQNrxvn5iZiHe6tnAaoVlQLKUd7dvHNINdYqNNS3LVJXJoVGiOSn3JMVo1YZ8uZ9jnfQ2x8muEyxLinUE5msoliVh1CaCZRO5Ye5MoBgMPcCL4lNbcyxFsvYoIzgvLO19PRcd7CAGw7hxZy1U8SRlhCpxMKfbssnGeWqZ3CLRiOakE8pXEuaoqyprdToowJJW4lqzeSe5Cg0y1yTBJ7B7IwZYg9gaFuFK3NdYM1bppquQmaQcVPLiY8y6Y5dXppXnKRknHAOXeIOLELwpfSpE4nmisM6Uq2OxVus/koEEBJwaRWhLQXps25dP8AHdOWmGFBi0MaDjXZ+fHE0lym2Q5ctLKLdZvkCRhTJTn+SOICCy7C6C06RKUUlSlEJSSSQB7KoIeN5bZ4wpu9afEUBlzkXjrOeNDHV6wHm9M1hdFUMeHUlKF6jElbQmpT3/Hcxs3JguKMBxR5J6ZOrIF2hHZmhm+5Z2bd8za1ystmWNcRak29wYzj25m1C6HXqeTFrd2UxaEAFdnvEFyJ9GmN0PTF3EkkLc1GDvcATSPTgWuHDnud8RBrHbFWGnpy3WM2x96ME3PkEE2ak3GMuJai1yTU0xQJ0KdjOagB53M8Vb90Kta4hdNrXvYJ2NnLhJs0SHJUMz/ujMDLj/EkXWppC2aWE8gQSGf5McUd0yxpRZTcIyqcI7DcfmmDsJa3EuCh6XBKGkPKbwiuaINFlGjSN6RKgQJUyFChTEI0SJGQUmSI0iYoJKZKlTEhASnTJyQBAAAA2CANrWta1rWtQVAuMI0zakNTWmTSAwabtPubtQT7Gc7zJ4kjLhDFE8yu7R9pVY/NRJnR7boGwv6xqblCy/ZFnngLKGb6bYVxeCgcHvpm1IaZdMmr9g1I6fc3afX2TZ3hrxG2XN+KJ5ih2kDSlx+UiUujI3TxhYFjq3J1luyMPIAYUA3024rC8FBbPyZjeEZix1O8TZLjjdL8d5MiEigc5iruV27ZIonLGlWxv7MuK5hFdM4ta00oVw3sINhcw3te1r2DIi1YbKW6FoH10zaO6ZdMWsPLzJhLKrXOtO2pLBOAMsZCanRkQOSKZYvlaSVQOHPbAhncdKslLdkYTb3QvKQ8u1hlWLGYGpvt0akMqardHWGMx52wXlXThnF1joWPMOJMwY3mGLpMxZFjI7s8ldGuOTVjYHM2GSxWm8VWZQWUMq6BaWSIfeCTwAD27QKBQKBQKBQKBQZTuuCUJ9bfFct0SlxBUghSfcX036c18fMUFiQ+MPCk4x3jKbMpYrH3sSB0HFXdSoBYfXZUsNtYNh3sXYLtPEY7XOZN0zQu24709yYpLmbCmSE2aIRjh7eiWOIZjUN8VksYcYKudF6tExx+XnN0hGbH3VxGFvIWAGkVGJEy85wRhkUzeETLGcylOO8iRaQQeeweQO0UmUNlbSuYZNFpMwrjmx7YH9kcyEzg1O7U4JjCVCc4sBpRoLhFa17XtQcWoFAoP70WlMmg0mj80hcgeonL4m9Nkki0pjbmsZZBHJAyrCXFnfGN4bjk7g1uzW4Jyz06ggwBpJoAiAKwrWvYNGva8156VeJO0rPO3NudRFhW6vMXxm0lh+RWkLbF5bkNuaSSkBub8LvZKIQYNmWKW7Dx0s6Yu7c6pTrqikh7YNwb20KjW7ztGajNqfPiOLTdSZMYnI/FWV4Yz7F0ZzG15XjcbEhVOjp4mlqlKiL5Xx6YsIFJWwCg00sk0l0IEckEcsuFynhnN+d315MBu3trhkSCXamYzEHk/FGTJWNtEs1M4wZW40yRQybo1diyJPl+CxsJyhSpLKMPk0aTKFq8sS1uc3BxCrZxKm0e2bZOslLM8NsviZpN1U+OOdYfaiOxElxnL2dQ2jydh4qxNi7kscccH5I4R/rKLsFjciUVhqTm5UoGE9/BYa9ZRKWHURtyzd2Wu7XjZj9KUwMWfY9RaNRR1lTZE81RYKs5YIpCx2mstjzs3IySAh7+7u54x3EaG1gvn0CgUCgUCgUH/9O/xQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKDIpw4ocieKdSnSkaBI+Gb10/Ke+7mBLbwv6vV5J06pMiGYYLqKOdTrlEB6hCH1BDbne9uYa61Bix73ertp1w7n2qnPrLi50xC3rJkhxwTFJMhWNU5ODhlga8TlvmQmhcWQcxzZ3Jh4RrG65QBNdrARmXNNIMPNCKOgUCgUHe2mLUXk3SPqDxBqXw28CY8l4WnTJOosruI3uipQ1KPdcxPBJRhQlsdk7SaobXNLcVgK29WcSL00y9rhsJaw8DYk3n9q1PdgbWtZfOuD4ZqN01vjoSkdT4JlhfCSptjBaoEYEgPQFY6iYZClv2F1bQtcEJtgBOMtYMfLFuWsgaTdSMBzfh1xdYrP8HZQjuScbr35F0LyFcXe0shjNpK0DAnJWonZCUUW5ITQWTq0p5pBoLlGCBcNOTiG4zjjca4fQ/VpCWl0GCPw3Tvrgw2Uts3FvbO0S8uOoZO1yW6QTgWWa14iyo83XpSD7gC5oSuoYrE25hT44SpxfkW9NhdMzmrS293xLqAbpUBKUIwg9hKxk8OycpyHYsdiEVpQ1towjvcFrqQFB58xWCINaCgUCgUCgUCg//Uv8UCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgyJN1Pvu3vxIOWcvmtIBJ8b668SazW5MsIGJufkMtlED1KLOdm4TeYsQrHJ6VpVFijAHXMAaWIztgjHQa7dBj68Q/t1ardEGvDIWVNR0rj+UY3rNyVmXMmJsvx4wCMMpRFzBMvf4tIYoNOjPh0sgbdMGUpUhTgUNIEy1NZCrPCEwBAQI0CgUCgUGxlw+MzKbdjTRBM5i7dm2RXC89Uurqq6bAb4zCsnZKSE3M6Aht3dojzMAu3g59mTbne9+d7hkK5gfj5Nk6bPChOkSnGvqpGMlAt8UkdvEmwGkI0zhYpOFYScFDYYTLAAEdhc7Wtblag0itsDJLfkvg/dRLOMTiudMTaKdzrGz+a7kE3Iu4NrNn2dxwLQZ26gShuaYhMmgkowYSRlKE4wBD0lgMGEZHBPaQ5A+501Ua53tlsCD4+x0n01QJ1cmeyhK65Fn73FshTo+Mu5pQykb3AoZEmtO4WKEA+yKYFA59kcZa4aLtAoFAoFAoFB//9W/xQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKDP041LQi6XdtOW4tC2UShou0+k0ZzVIk4vdrVJV7zMcMyVwARcdjCXULpIGlUtNCXYkaZrTXGO5xIABaB2DdXbVrP2n9IWRi3EpbMcfY2adPuU0wl93B0RZCwUjS4+WLX40VrXKdpvHGpsk3Z+HpTvhX0HlYKHXF96rL503TxYNaxHBjOj/EkNxsMIh3GmXz7ISFPlyZPCTw8iwhZ5ayNJoem1+3Zx353te3IKq1AoFAoOTyCEzCJt8UdZRGH6ON07YRSqFKn1rWNRcsioXZzYLSmOd+JIE8xk1+ZFyEtwT2MRmrUCogBgjUx4Cw0qdbet2ObP/DgaSdOqVe3elT6kdF8HxBj+EnW5OceV5Mxk3umeMlLmxd3g0LVjUM4VJkwzi7AUPyxAARFiRKAFBmX0F+3Z9wBqAzpwrms3B2n6NFzHLOpXVk64+gDLZUApImYZ9LtKGLZq/SFWoRqymSPxGOp3x4c1Nix3SNaM1Ta9hh5hC5FtuaDsX7bGjnD+knF10zongTOYunU6szpGZ1yllKQGWcp7kV8IIGpUdu9vBlykBClUtOa2RKhbQqDSURN7B7poFAoFAoFAoP/1r/FAoOMzWWtEBhstncgEoCwwqMv0texIyO8qwtEcalTw5CSpuoHeFFkaMfQDqt1i5W52586Cth5br2aPfQM7+yGlHxKoPsJ4ujZmNOKLHkbOacBhgADUHYFloiSAjFYIjjQpzTz7llWv1CsAAx3tbwBvfla4e99Ku/NtM6ypQ1wPCusjH4MhPSgtC0QPKDXL8KyR6dFB4SEjNGwZYj0Pa5e8rRGBuSkaFS88y1+Vg9QRhCEvVBHbuJboulDa6hWO5/qxepqyRrKMoc4dFFELha+aKDXxpafFpUSuSNxxRyIm6DmIBl7XDcQbh8F+XMG3bui6UN0WFZEn+k56mr3GsXShsh0rUTSFr4WoKfHZp8WkpKFI4nGnLSbIOQhmWtYNhCsHw358gkSoOm9Q2d8f6YMG5X1EZWVOaLGuGINIMiThWythzy7Jo1GEBrk6nN7SnEA9xVlpSRXASC9hDv4LUET2ibiGdtzcC1DxPS/pxlmV3jK00bJU7sqOUYpeoqy3QQ2OOUpezVTy4KhEECLa2szsw9IhGGXCG1vDe9gnFoK2U44rraEx5NZhAJPOs4ppLBpRIIdIU6bB8jWJ075GXZWyuxKdWSrESqJKXojAgMBe4RhtYVvBe1Bxfy3Xs0e+gZ39kNKPiVQevdOnEXbOepyUtsGg2sqJRGZu6shC1sOaItPcLEL1aswohEkRy3JEYj8BVL1ys6xJKUt2EqMN9NCVfqBcQTaEnEqCSlCc0s8g8sBxB5IwmknEmhsMs0owFxAMLMAK1wite9r2vztQfZQKCEHV3xFW0lo0fXSGTvVA1ZLyGzmKU7jAtPrK5ZkdEKxIQA49ucpLGQ3xwzOpRpoCBpFz4mUln3EAYA9kdcsI7WLjM9pp3fzmdwgOtKLtxSvu4JU+4gxeoYFBPfQJe/kp4znaRSgKTsBXU8jG0B/Yhvbs+25FXCbXRRu2beG4Vcpu0qanoDPJrdAa4qMVPA3KBZdTJUoDxuSgONJ2hj0udUDTZOLvS1vSrEBQbgH29wGFjGEjdAoK7florag8mryAPHnmrySfJR8h7xO8hd+8TvHx47PGV3LxW753PuXi97l946uy6PT+fTQWJKBQRPbiW9Fod2uZljmCaspFkRifsqRl2lsQDC8eOk1SKWhkdS2dwEsUtqgvuKgpYaHkAYfTwi52vfle1g9O6F9dGAtxPATbqU01uUmdsWu0mksSQrpbGlUTdzXeJqikTwETOtNNUlpi1JtggGK9u05Xva3Lle4exKBQVysscVHtC4cylkjEUpyZllwk+LZ3LcdSRbFsPSCQRpU/wAKfl8beTo+/pFNkb4yjcm03uywnmSqJ6TS7iAIN7hNXpN1UYZ1saesa6n9PsiOlOJMrNji5xR2Vohtjj7sz86xh7bXZrNGYe1u7NIGRUkVJjL9ZJ5Ag38NqD0VQKDzjqg1e6ZNFuNleXNVGbYDhGAJhGkp3iavAEq19XEl2OGzxCNoy1kom0g7C/aBbmdEuXCLtcQSrhDe9grqZD4yDaNhbmYgjbDq7y4lAoNIC9Y8wzDm1sOKLuOwFhZWV8tYxebJj7BtcNhpAHWsK3UAN+drB7U0hcShtIax5a1Y8iuoNbh/Ij+tLb49D9RMUXYsE+qz1N0iVI2zQ094xiNxXHXLCmRGPpa5SI4ASiRjsMIAnloOitTWorGuknAmUtSWYVTuixhh6LqZjNVbA0mvrwmY0h6dOoOQNBBhR7gcWJSG/ZgF1XDa/LnfwXCv/wCW69mj30DO/shpR8SqB5br2aPfQM7+yGlHxKoPTujXiMNs7XfqRxxpS0+zDLLrl7Knjv8AGigk2JX6MMh/jHgcoyO/99fFqgaZD2UYh60ZfVa/anBAXbwitQTsUCgUCgUCgUHmXWXpSxfri0vZr0o5jRjUwHNUIcYo4LExZZjnGnewyXOJTdiCd7p/HHA5a3oXlu7WwyLrUJVjQDKuMAgpQcOXkDN20Ruc6kdlHWTcbAlzS4DnmCnm61ZfH8myhFGRUc2TPHSlZ3NvOjOovD7TYVlZoQuAXWKtzKeQS5BUJSQ9Rb8XC9ZQ13akZtrc0X5QgrXlDJiGPG5ZwpltY6x5kf3+JRZriKKTY5nLS1vyducnpjYUJalpdEiZHdWWaqs4g7bu4AqCZS4dzefxGsWJZBoKyxIykhgrAX4tcoHmBGuJuoITkqkdsYS2VqxFn94AOxZhJagsvquaWX2ZtgB17FtifeEmLiFradu/U0kUiESGxspgZ0GbrXPM7IFxO82Ux9pAGwr+n3ufaxYfThdIfDQSjaduD53Y8u2RL8uWwLpbZzD0glyXJOTSZzMS281SSBSobGHCzfkSPql5KIYzQJlj229Yw2LGYVe97hCRnUJt5bJXDo44QzvU0523LtwdzaRPmEMA5HA3x/HQXMtQrTMuQZhgePu0hQRjFhaoIgHnzRzkwHk5GcWzprqE6gaUKZGe9TeRNVmpKW6mNSKw7IsuyHMm6RzhuQKxRdCojzb4ntyDH8SGQQ5AhcUj0PbE7GyEEFHFtDcmILLAMJNrXDnWuzXRnzcP1DybUbqEfkq6RuiVLHYhEmFONsgeKccsx6wyK4wxwwdqcWww2MlrjeyL6hnqVJx6tUYcrUHnGB45oNkHhx8QyPCeyroNiksbkzc9yLHEuy9YKfsriVxzOuWJ/maBuCkwu1rmqVePp01CF1XuMsPIu/gBa1gm3oFAoFAoFAoFB//Xv8UCg6I1S+Zk1GfaiMveh/IaDFm2z9LEQ1ua8dMmlGfSKSROHZwyMRDH+RxC7XaStCE1ndnG6tnu9IHRr73Y1vCH3OTmg6RX8HPlewXz/KS2gv17LV3+H4a9tnQVwd7/AIbbIe1FjVl1K4vzGZqD02OEqbIXK1j3FSojkTFj9ILKLRk2QpG5zd2OSRR8VJBJLOqe6AZDgcQnMScjgGiCyNwj27VljVxjnKOhfUfMHXIOSdOEQZJ5hueyFZ4pSp/wcN0RRF5ispdVRwnN6UYzkjm1FIFx/bnmt7wBMaYEKMntA4Jxu/mTdEvsRE59DU2gcER5k3W17ERBvQ1KoLulBF5vZeqjdxn2ETNXtHONBnGcJ56uy08fau9Q/oKzKg1tqDDgybBW7KO43kHGbusWt7TkTWzK4K6L23sLOKFul2dV7AtWILqSlCay1MmcBDK7QsYOsNuoN7c7XC+95SW0F+vZau/w/DXts6CEfeT4VSWbfmn2Wat9L2cXzPuHsahIcMswKexhqYMnQSJqV5KC05anyPrbMM8Y2xStJs6kAbWpU3J7XVhCpIsf3UPYnCDbtmVlOXB7W+bpa5zPHb/CpPLtLC19WjcXjHsggjcORy3FLYsWqe8igLtCULg7IEYbjA0qms0BBYSVhlyQ0NaDMb4jHiI8k6pcmZH0R6Lcir4fpFha9dB8m5BhykxtkGo+UNCxUglCVNKUKq6oGDkysm6RIlSCJKkYAGKlQ1CI9MQWH8TbC4RrU9q/x7FM76uMm+kg4tmTchkERx+XDzJfnqUx5eUFQicnpgcnOPsOK0TsiOLPSXcDHJ16edlDYnsIAxBM5JeCN0bqmFYnh+szUyxScaYYUDxJY1iyVsKZXckYSz1kca2KGOC5MFRcIrlAdU4hAtcPaWvewwhUR3RtnPWtsrZVgsolsgE/Y7e5IA/CGqnDiuQxxB472SxjwhaF5wDE0gxdlNvSIhL06O6k0JxRBpzetVhSqREBdw4Zvfmku4bG3LRpqwdCVurTEUKDJIhks25ac3UHjRlUJGt1XvqcsolIVlOEiWpPFEZV7Xe0J/frFWNTLzBBbhoMRf56x/gRD+CToNuigUGcZxvfmm9DH2ojJvogNlBP9winqmjH/wBr3zz7VCWgs60Edu7HrIS6Btu/VTqhA4EoJXBcYOrVi7tbkDGqzBOzSILisstGfe93AlJOJCiVqygBGILemUGXt0FjvYMUxphk6mrTkCatLC/SJmx81IJbkmTFEKFqSNNcilzFDG55kbkO4rEeLMxlSFEUIwVzD1Kq3K1+Q7hDQp4KfWfeV4Z1N6DpQ7hMdsTSRv1A4obz+i6kyBz8aeL5Lb0PQENwtkVnDe1LBdpzFdRJxcr3DbkELzlB+ovXI2tCsc3FSSib25IoXLlikwJSdIjSEjUKlJ5ouQSySCCxDEK9+Vg2vegxhNe2sHUlvb7khbkiWOsgWZgzE0YQ0l4oWOSlLHIBDJbMUkTxnFkKVUYJCyrXkStKukLh0F2VOZ6hUbYBdgFlhcdwjwS+j9DjRsJ1IasNScpzEe2FGPDlhE7GECxo1vJqcQj0bYyzzGGSZQ/NiBWMIAKTXBtNVll3HchNcywCwq6b6Gw7kjZ9l0Hl7DPDs06WsuuaqPQPJLg1pmGXRiboG4x2V49yEzIz1Db4pqmlOerbHFGIKdyTpVHMhMYQIsQW1+EG3Msoaq9O2W9G+c5I7zWY6SSYg7Ysmr+oVOb664Vmyh7Qpoi9vaxUqWOZ2NZC0XToTD72EBocUiQvmUitYITT793qnHcL9h3kfw5NFBl97Hu3XjHdF11s+lXLc4nePYg5YuyJOjJHjm8ftJC3GGpW1QhRg8czO+NfclQlorG8yOvla3SK3h5hc58pLaC/XstXf4fhr22dB7Q29OFw0kbc+sDEOsrGOoXUZOZxh3x/+IkWngsZ3ijp5IWL5rity8VbR+DM7v7omicKFJHYqS/dSSX19QOoAgs40CgUCgUCgUCgie3S9qXGe49E8ey5plS3A2sXTnI23IOlXVVE0BSiWYwm8ed0clZm59S2GnHKIGfIm1OqMRDNAcjVlhVJDCzO2AoCQjBTxmB+xFAXHUDEI1Bc23YSUOUo7CHnxfgYJq0HHtL484+dTlSpzPx7KliETqwgcuyeSWhanKciEy8ClOWHbNAoIG98Z13vm/Diz3CYYcMqo2XEDzsnO6BxMcNYwF9lLwodysIxObtKfD9mNFFUBQRHAWOc0XuC+xTMgTqExShQGRhl52y0+ZSyE5Z6csiO+azpg/lZWX5cWSRdlEyfInJQhlJWQVMxMNlYpekd05pK8LiLvpaksYDbWGG9rB11QKD1Poh0pTrXHq30/aTcdFqwyXOWSmCGmOqNuNdrxOLmHCcp5PlrcSYUaqZsdwVvcn1eEIg3sibjb2v4KDcmgkHiWMYPDcawFiRReC49ikdg8LjLbYwLdHYlE2hGwxxiQBOMOOCiaGdvJTlWGMQrFl253vfw3DldAoFAoFAoFAoP/9C/xQKDojVL5mTUZ9qIy96H8hoMgXh/fVy+3z9r3R+0vJKDZxoKvvFual8QYq2kMpYBlkmaistaopfiGN4nhYVZBkicSMbZmx7luaSsLUGxiwqMsLDCBIlK64QJy1zmkIuPtFBYBhWd4LHE8tku4zn7MCEpWTB8WaT3+MSVxJsK6Y2T5RyVjwUNjyy9hgCELk2QR7XAvfq9ParW6fD1ACXDjd/Mm6JfYiJz6GptA4IjzJutr2IiDehqVQXdKCLzey9VG7jPsImavaOcaDOM4Tz1dlp4+1d6h/QVmVBrbUGIv89Y/wACIfwSdBt0UERe+9qFxZp12l9dLvlGQNjNbKenHLuAMftqxUUW4yrJubsfSTHsPZGFFcJqhzXplr2JxPASAVyG9AoUjuWUSYYAM47hbMWTHJW9dpWdYrZaS24lasy5TnbqiKPN8SYchxBM4ZzV9gaR2SJ/lU2amYwYx2Lt4p25hM52KGGiFxCGq9/0dbSGrfJcMXK2yfzCJNWD4O5oTRplrU75rfm/H7s+IVxXua3Occhrw6OKM8HIYFiQrpuEV7DCGfHwt+hSKa2N0aIOuTGNNIcWaV4Y5aj5EyORJShmkUtjT/HY9i6POiY4o8lamDNpEQ8mJTQ9grTMpxJvMsYgDDW/oFB0JqX0vYA1i4ifsD6mcXx3L2JpKtZXJ2h8k8UCUxjlHXRM8srkhcmda2PbO4oF6UNwno1RBoihGEiEIk00sYeIsAbIO1jpZy/Cs+aftIsUxfmDHS1wXwydR+c5cMdGNS7MrlHHXsiHPIK9tVJnNheFSNQQoINJPTKDCxgEEV7XCVigxEzjiU+68aoUGlkEEbhgzjzzhhKJJJK1I3GYaaYO4QFllgDe4hXva1rW53oNqjyXsTe+oY7+BrGv5p0DyXsTe+oY7+BrGv5p0Gdlxr0pjEp1LaH1EYkbDIyEuDMlkqj2F3b3clMcOfNgwFHmN6hQAkwYPDYIr2ve3hoLDnCKeqaMf/a988+1QloLOtBQa42HWgNGz6VtAUZdTijXg5fqhy0jSrrkhMbEA33HWIGxenID1K0ixz8c60wg4diwHIUZ3ZiHYsZYffw320cxZ/2Vder9P25Ekkm4+1TDEmM3t4Qn3Tx+KYUIemzHE0SqTQm37NDqJUOC1QBOTcBgo6lEIZogBASFYjZB1USHbg3ddPkon3f4kyiye6aZdQLKqEEIW2MZGchY4kgZCAhUWExJjya3QPxwSzDORzGG4QHcrFjDZVoOPyxhBKorJouYpEiLkkfeWEawBVjxpAPDcpbxKQEiGWE4RAVHVYNxBsK9uXO3qbBiDQd4zPtabhETf5fCCS816ItS7I8P0DkVlSFrfH7Ek2TLVbOassnup8bcxRtt7JXFOAXaoFhatMIQRFjuGrVoY4gra811xqMDi+pCFYWys9JCAOuDdQL414tnLU/3JKEqYmVykqpDD8gisMy4k5rC4LxHkhuIZZJgDSigl8lMKx5lFjQIJtEoZkWN94SvrYilLCxy5j733NQSieUCZ2SuCDvHcHA0BSgsPV2J47BF0jva4fyobhvEOOXFS749xVjeCOyxEJtWOkNg0Yi7iqbhnkKRoFK1ka0Kk9ENSlKMuUIVwXGWEXLmG17BGjv3eqcdwv2HeR/Dk0UGfdwkD6xxzeAjDnIXlqYW0OnvOBInB5cUbWiCcc3MViihK1xxBFjDb2vYIermL1lBqh+S9ib31DHfwNY1/NOg5AwzKISoakuMSqNyQxEEoawDC+NbwNIA+4wkiUhb1SgRATrlCsG4uVhXDfl6i/IOSUCgUCgUCgUCgUCgUCgUFF/jBNqCCPuGiN0/DcVbI9krHT/DoRqtC0p2tqT5Ax3LnFvguPspPXW4ojHWbwebL2eOGCTo1jg5M7ySNQaWkYy7WDOnoFBpMcIptFK8EYlcNzDPcXOb8ragYuKO6aI3IWM9I4wnALkYkcHDKxVnE4JhTrnQ9OR4knBREmFRJGWqTLFCORGlFhdgoFAoFAoFAoFAoP/Rv8UCg6I1S+Zk1GfaiMveh/IaDDs03INQ7pnPGrfpOMyqVqMVSIsrEpmD3KSNGWAym6RVcu8Gc4eqRSVG89ysdyGjNAbYrr8PLnQTqeRfxX/vZ73Xs3tXf8+tB/XxBw7O+fuDZcSy7UdCMjQEL2chDMdQOtTJ61yk6RsPONXm9TG9v8szPKXMBak8wpNZvCmsrH2alSk7QRlg0Z9qLa0wVtN6ZUeA8RKlcvlMgcwS7MmYHtuTN0kynOxIy0XiichTnKwMMXY0YO6szQA88tvTXGIZp6s9UqUBXD43fzJuiX2Iic+hqbQOCI8ybra9iIg3oalUF3Sgi83svVRu4z7CJmr2jnGgzjOE89XZaePtXeof0FZlQa21Bhc6glUxQ66c3LcdheR5AR6sskqoKCOIz3CQjmKfML0bGQsKBKQpVLnkT2AiyUkssww0/pCEIr3ta4S85n3H+Jt04RNLPdQ+RtxvAsGWviOMoppmfBUxxdE1ckcEbg4II8lkc4xaxs6h8XIGhWeSkAddQaSlNGEFwljuEPI2G8abqO/bqHtjtFlOd6qMpRKOq5YsPzdnNrbo9jKBnvbe1vEiZmeZyNInaYykenlKBUljLYoOCapK90wrjBzDSf2Ldj7H+z7iWXqXqVtmWtUWZyWQOXcntracijjKzMgTVDZjTGhTkSU8lQ5A6KjlStapAmVvauxJygggCZInTh5N4wePO71s+LnJtLENFEtTeEJDIBB7bkU0KSJrFCTB9kUMvpu/ydCH3MuAHMVuQuvoCIIDuCKf2dPq61qxc9eSW/vGnGHP7Y1i6+8LGeN5NQtz4vK5AuX2LatlTcWZzFYXUrByte3O9g0iqBQKBQKDC51BQ17yNrpzdj2NFpjZHO9WWSYbHyligKRIY9yfML0yNRapUOwgpkw1y4uwzL2vYAed/WUE6nlQfeO+kW07+z0bf5g0DyoPvHfSLad/Z6Nv8waCJbca2sNWG1nMsbQTVc2QNtfsrRl4lsSDBJmmmaQ1oY3UpnXiXqU6JF3JQFYcHpBcN+oN+fP1lBozcIp6pox/9r3zz7VCWgs5jGAsAjDBBAWAIhjGMVggAANuoQhCFyCEIQ253vfwWtQYvO6fqOle6fu25wnWNOqXF5izyyYI05NiJQE9M8QtidWvD2HANliDFZBApsnQpXQ4JIjC7rnQ4YRD6uq4bAGkfTrFdI2l/AOmOFXLOjmCsTQfGaNwLT2SjfFMWYUTc7yZURYQrAcZS8lKHFVfnfqUqh39bQZYHFJ6Mg6St2bLsnj7IY1Y41YtTZqZiRpacsLeKSzJQua8voy1ScIU43EzKzI6OpxNwgOITu6a4wiCYWaYGjfslazy9eW2NpUzy4OfinPicfo8X5fGaeI5f5LGJ7+MWXuTl1W5kqJgazlP5YOYulK7FenXvzoJWKCEHdV2C9D+64pJn2TW+RYh1FNjKnYmrP8Aiq7akkbm1oLgs2NGRY65pVDBkNqbCg9knGpCndEpHIlOuJJtYugpgapuDR3F8UnublplyXhPVhGiBLRNbVd4Fg3KC8snrGkAfHZ+sVY3SHLC7WBb4zAQAm35CuEHp9BEPDdSu8nsh5bSQIMw1K6S5Ai6F4cP5JTOLpiCatSZR0muCCAzAp+xROGUwRhicLu1FKBEXMNCnVlG9V7BpCbCu9lGt33BssLmEZasb6qMGeIKTNMIYbq/Ge/Ncku5FxnJWO/FJWuci469nNChOtb1ByhS0LyuzGaaSelOODvvfu9U47hfsO8j+HJooMlrb70A513K9RCHTHp1VQNJkhwiEnmyc7I0gcIzG/EeJEpTnUI3RsYpEpCtEBYDsgd2uEd+fMQfWhO55Tf3cve+0iezmmPtpaCznw1eyprF2nJ1qzkeqRww2tb81RLErJDg4smz1LVBayEvE7XPN3kt2h8XChJERI0/YiAI64xWHa9g9Nr3C2ZQKBQKBQKBQKBQKBQKBQR77s+OmzK21/uEQV0YASa7no31EuDI0CSqFphkxjOLJPKYIuRpElhKVDmzTRlQLEgABGK6lOXyCL5FuGIfQWeeHN2KJDuV5qatQ+omKvrToPw+/d9fDjixNgdRk9YlKc5Hh6OLjbgVeMohXyMlzojAMYEJY2pKcmXrLLW4NXRAgQtaFG2NiNI3NrckToG9vQJyUiFAhSEgTpEaNInAWQlSJSCwgLLAEIAADa1rWta1rB+3QKBQKBQKBQKBQf/Sv8UCg6I1S+Zk1GfaiMveh/IaDIF4f31cvt8/a90ftLySg2caBQKCnrxoeFJJOtuXCmYWFMoWtuCdTLGbNAE2t2LZFclw6TRFO/q/cq4rFkTUpmbw+nht2jmHwC8FwhHTwS+q3H7A/wCsHRnJnZAzz+fnQTOeKkak4BJ0xSRVrfYvlBpR3OGXY5zjiE5jXEpiu0OORmLjrhCWkGK4aEFBALxMWq+B6YtovUwxyJ6RETnUlHQaecWxgSpGB1krrPFiVPMVKRIoCccNui2PS3NeqPCVcJYwEk9ZRqgkVBTP4N7Ccgn+6dKMtJ2wsyKYD03ZDeHl7Up+2JRSPIjlHYBGGZGda9xJXl5a3N4UFivboEiblYb3sIQbCDUqoMRf56x/gRD+CToNivXno0xhuAaS81aTMtEhLjOWYkpa26QFoyVrlBpmgGW6wfIDGUfcAbu8NlKNKuLB1gApAUNOZe5JxgRBj4YhyRqk2TdyxLIFDWdG876RMwOcVyBDT1a1MwT6NJjxtcsiqtUUEkTtAcpQpZcxCuAEQDUS1K4JvTwkGWDZV0w6j8V6vNP2JNTGE3zxw4vzNDGuaRRwMAElaQnXBGQ4sjylCYbZvkUZeUyhtcktxCElcEhxN73uC96DpPcq0dtevzQnqa0jOKlI3rcxY1cG6Hu6+1xIGLJccWoZnix+cAgCI4bYy5FjjWpVgL6TDEpZgAiDcVr2DJV21NYGVdl7c4i2TcjQqSNa7D81l+DtT+JzQ2RSJVBl68cVybG7JjTSE6qQRVxbynhrKMNAlUOzQk6zbEiuOwbFuBM/Yb1QYlhWdMA5DjeUsUZCaCHqKzGLLgrW9amNDyPRqyr2LWs741KLCTL25YUQub1ZZidSUUcWMAQ7goIS967eoxDtAYUjkgVsrHl/UXkl3QJMWafhy7xsOLrGiF3RLciShySNT+ujsKYEic1OQoujGJxdzCkpNugKs5KEYOz5xJepPdi1iMWmyO6EYVj+DNsXkU+y9lhLmiTSQrHcKY0tkyFUBqMxm1JHF3kksXt7WiTGKyOsSoZ3O5ZBnILeVBiL/PWP8CIfwSdBt0UCgzjON7803oY+1EZN9EBsoJ/uEU9U0Y/+17559qhLQe1+IE1n30N7U+p7JbM7haMj5FjZen7EZgeiywU8zIBVGjnBruaEZNnOIwbxafyuuwg3u0XtyFe9g3DJL0iNertsy7HcxaMcfZZmGXMIPLRM2WRYoxK55ccMfvdxqy4/IVrOmikvakCgKlOaNCcsS3sFQR2hPI0qwghOf7idcVP73mv/AOCYlfFf6CPXX1k3eS1cR2LT/cHg+qyYxTBqSQDj85ylpmdMdsUCQTdZHEr5ZfKmvFsOREIHhwZW0AQr1AygnhDYqwRmi6wstcFDrREzTvVLoElDx0N0zam/UxiNvUHGFkFyiNhaoHl5CkCMQiT3F+jaiNKwFAsAdk7GpMv1htfsw0DZq+OMYhstkrOwKJU7x6Mvz41xdGpAjVyRxaWpUvQsCVYMlSBIoeFKcKcBlyzLFiMsK4RcuVwpY4h41jA2Rcs4vx9LdFEzxjFZ1kSFQ6TZJeM+Rpxacex+TyVsZHmcOjf5GrVZe3RNtXGrzye9Ju1KTiD2pfPrCF3IAwGAAYWIIyxhCMAwCsIAwCt1BEAQeYRBEG/O17eC9qCthxYMGwTI9nDNcry0hY/H5AJriNfp7fFSZEOTN+T33JkWY3RqiyhRcpTcL9jdQ92cyCx9Im1OaouAY0pfSFVfgs081FudZxVshZ14YRotnqecnG988TQGKsw4OMixYOy90XjgNcEZ103ben9xAu7P5foLwe/d6px3C/Yd5H8OTRQUA+EH9XHRb2HfOnw2sNBq5UCgUCgUCgUCgUCgUCgUCgUHkXcBlCGD6DdbU1dAGmtkQ0i6kpQ4lkdHbmIY/huZuysBPXcIO1GnSCsHne1ufqaDMd2LOHczNuhSBlzrnRLLcL6EmpxVBUT0ogDPN87rWlSeiXRnCQHhuXJjWJC7JhpHaUGpzmxIoJPRpLKl5CotEGqZhXCuKdOeKYJg7B0Ej+M8TYzj6WMQeDxhLdI0MbQkuYZcIbmGHLF7gvWHGqly5UaeucFx5ypUccoONNGHaFAoFAoFAoFAoFAoP//Tv8UCg6I1S+Zk1GfaiMveh/IaDIF4f31cvt8/a90ftLySg2caBQKDpPUhp6xVqwwRlTTfm6OhlOKsxw51hUyZ7HXSqhNzkWERDk0rggMMa5AxOJJK9tWF2uaiXpiTwenlh5BlJ7iOwzuT7TGbj8q4WYss5RwzD5MZJ8Par9PCWRClcNSoVVj2dbP0UFMMl2IJmzFnFFnLRWA0Hn3vdEuN9PLLD9aK8Urvcw6MpIn6Va1PwmtMNAQ+zDBWDXyVgAAHYleKDuqx8A12Wpb259utAoUGDtzOGZfnzDoSK4P3l9+nNzLLF7VnvVS/j7RnIy3kIs6M4IxiyqFRipxTJJOpQsOJMeMtjyDVA2plKJULTixWTo1Ci9gCDTk2ZNpTGG0XpZDiGOu5M8zJkVe2zPULlkCUaMqZTVI3CRN7HG0p4QrG/HsHTKT0zOnP9zjBKFKw0JZyw0sAS8UGIv8APWP8CIfwSdBt0UFE3jFdrEczhUS3Q8NxcJslx2kZsYaq0rQlv3t2gChWW34wywuTkAAFSdCXdX433RULtVQ25wbOfSkbRiLDxrwfW6r5FOWX/bJzJI+xx/nB1dJ3pqXOQ/dPG8zENtlEwx6FceoCBC1ZLjzPZY3kcrFWfUAyigiUut+oNHygq578vDkY/wBzwSvUlpyc4vhvWs1NBSR4XPCc5Fj3UI2tKMlIzNGR1LYnUq2Cas6FMBK2yMpMqGNKAtEuKNTlpD0AUNko97vYhnj+jbQ6n9G4DHwo93UEtgZTp4nbuQaSgRu9jVyGa6esmHDCkLIKU8nAfZcib3sEVwXDvmVcU/vbymOro7bVYwxuzgmukUPcVwPglpkQCDCxFH9xdB49VCa1BwRXvZQlASoJFyEUYWK1r2DrnS3s+bvu8HmQ3J8ig+YFKCcOadfO9W2rJXL2KLCbzBFWMckEhmxRsqyQJGmOCBM3xxK5diHoBeyZOG5hYaa201tO6fNpXTsDDuIrmTDIUtMbXzOWcXpsJbZTlmXIE55KU8beWrcQRmGR0C08lkZCVJ5TeScYMw5SsUK1agJTKDEX+esf4EQ/gk6DbooFBnGcb35pvQx9qIyb6IDZQT/cIp6pox/9r3zz7VCWgr8cahrQ8e+onTloVjDl2jHguGK83ZPTpjeZB2Scqhu0wpncirm3uFxiGPGUxeTewA2unll+Yh38BYTh8IJo1Dp72z1+ol9bzEk61o5EcJ11nklkKSsVYxVvOP8AGaE4HZBUiLUuoJC8pxjGIBiR6KEAIbXuIYWuaDobVJp+h2q3TfnPTXPywiiGcsWTbGT0fcmx5rYVLWFa0pnxEDrLuFzj65QUuSDsIIi1KcsYb2uG17BjcaEs5T/ag3UMRZFnyVfHJDpa1HOmOM7sJPfSlIIojfXbFGdY92BiYlScd41VrsWnCaRzsoAUO5fUG1rBtaoF6F0QonNsWJHFtcUide3uCBQSsQr0KwkChIsRK04zCFSRUnMCMswAhAGAVr2ve17XoM0rfw4Z3UTiLN2S9WmgTGD9m7Trkx+ep/LcO48blD3k/B0me1St3k6JihSPvDzN8ZKXE0xS3DaCVC1pKOukPShTpi1h4Rf6Z+Iv3hdCeP27Tky5hJfIpjdInjEbhWoXGDVL5RjpubQAJSxhI9vSVonxLY1pAgISt7ksVEN6YACUxZBQQgsHWWUM/bynEC5diULc0+W9U7hH3cZURx9jiEtsRwji1W7F3KNenuzC3sGOYcK6QVyjZDJltlVk4rFGLbl3CCg0ZNgrZmaNorTW/oZu8ss21S53UMEjzrLmMvtGCPEsSNUCMYohS88hOtcIzDjXVaceuMAUY6OSw47swEASlFB3nv3eqcdwv2HeR/Dk0UGRpoo1waitvjOKPUVpdlbVDMqoYzIYgnenmKR2ZIgsUoKTkvKYTLKG9zahmKC0oOk25XaF8vTb2535hMX5bD3svXh8d/BeMK/zm0EtuxXxCW6Nri3UtLelzUXmWGSvDeUPJu8eLA04axfFHBf4ytOeXciR7u7/AB2Mt7yg7rKokhOH2JwO1AWIsfMAxBuGiTQKBQKBQKBQKBQKBQKBQcOyDj6EZXhEpxrkqLMs4x/OGVdG5lDZIhJdI7KY66E3TOrA/tSmw0jqyuqQYiVSU4IyFJAxFGhEWIQbh/eZWVnjbO0x2OtLYwx9hbELKxsbKhStbOys7WlKQtjS0tiEohE3NjciIASQQSABRJQAgAGwbWtYP6dAoFAoFAoFAoFAoFB//9S/xQKBQKBQKBQKBQdYPOEsMSN7DJpBiPGD7JAHCUgkDzAYq5vYFAzRHjPC6rWk9eE4Rw7juKxnVcV7358786DsskklOSUnTlFkEEFgJIIJAEokkkoNgFlFFgsEBZZYA2sENrWta1uVqD7KBQKBQKBQKBQfWcSSoJNTqCizyDyxknkHACaScSaG4DCjSx2EAwswAr2EG9r2va/K9BwxuxljdoWpnNpx9CGtyRmWORuDdFGFEtSnWte1jUytMgKPIMta97dQRWv4aDm9AoFAoFAoFAoFAoFAoFAoFB1/MMT4syGYWbP8aY/nJpPZdibMIbHJMYV3cJ4SOzG9Nq0QOxCqNsDle3TYwXLl1X5hy9pZ2lhb07SxtbcytSTte6trSiTNzem7c41Sf3dGjKJTk9soOGYPpDbqGMQr+G973D+jQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQf/1b/FAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFAoFB//9a/xQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQKBQf//Xv8UCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUCgUH//2Q=="/> </defs> </svg>
                                                                                </div>
                                                                                </td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td style="width: 100%;border: 2px solid black;border-spacing: 0;padding: 16px;">
                                                                                <div style="width: 100%;">
                                                                                    <span style="font-weight: 600;display: block;padding-bottom: 10px;">Terms & Conditions:</span>
                                                                                    <div>${invoiceSettingsData.tc}</div>
                                                                                </div>
                                                                                </td>
                                                                            </tr>
                                                                            </tbody>
                                                                        </table>
                                                                        </td>
                                                                    </tr>
                                                                    </tbody>
                                                                </table>
                                                            </body>
                                                            </html>
                                                            `
                                                            // This code for local testing....!
                                                            // const browser = await puppeteer.launch({
                                                            //     headless: 'new',
                                                            //     args: ["--no-sandbox"]
                                                            // });
                                                            // end...!
                                                            // Following code for server start...
                                                            const browser = await puppeteer.launch({
                                                                headless: 'new',
                                                                executablePath: '/usr/bin/chromium-browser',
                                                                args: ["--no-sandbox"]
                                                            });
                                                            // server code end...
                                                            const page = await browser.newPage();
                                                            await page.setContent(html, { waitUntil: 'domcontentloaded' });
                                                            await page.emulateMediaType('screen');
                                                            const pdf = await page.pdf({
                                                                path: 'invoice.pdf',
                                                                printBackground: true,
                                                                format: 'A4',
                                                            });
                                                            await browser.close();
                                                            const pdffileBuffer = fs.readFileSync('invoice.pdf');
                                                            if(pdffileBuffer){
                                                                aws.saveToS3WithInvoiceNo(pdffileBuffer , 'Invoices' , 'application/pdf' , invoiceNo).then((result) => {
                                                                    ( async () => {
                                                                        let obj = {
                                                                            invoiceNo: invoiceNo,
                                                                            invoice_path: result.data.Key,
                                                                            is_download: true,
                                                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                                                            updatedAt: new Date()
                                                                        };
                                                                        // console.log('order id :',orderData.orderId);
                                                                        const updatedOrdersData = await primary.model(constants.MODELS.orders , orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                                                        // console.log('updatedOrdersData :', updatedOrdersData);
                                                                        await merger.add('invoice.pdf');
                                                                        veriants = '';
                                                                        next_orderId();
                                                                    })().catch((error) => {
                                                                        return responseManager.onError(error , res);
                                                                    });
                                                                }).catch((error) => {
                                                                    return responseManager.onError(error , res);
                                                                });
                                                            }else{
                                                                return responseManager.onError('Unable to generate invoice, Please try again...!' , res);
                                                            }
                                                        }else{
                                                            return responseManager.onError(err , res);
                                                        }
                                                    })().catch((error) => {
                                                        return responseManager.onError(error , res);
                                                    });
                                                });
                                            });
                                        }
                                    }else{
                                        if(orderData.fullfill_status === 'pending'){
                                            return responseManager.badrequest({message: 'Please first conformed order...!'}, res);
                                        }else if(orderData.fullfill_status === 'shipped'){
                                            return responseManager.badrequest({message: 'Order is shipped...!'}, res);
                                        }else if(orderData.fullfill_status === 'delivered'){
                                            return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                                        }else if(orderData.fullfill_status === 'rto'){
                                            return responseManager.badrequest({message: 'Order in RTO...!'}, res);
                                        }else{
                                            return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
                                        }
                                    }
                                }else{
                                    return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
                                }
                            }else{
                                return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
                            }
                        })().catch((error) => {
                            return responseManager.onError(error , res);
                        });
                    }, () => {
                        ( async () => {
                            const mergedPdfBuffer = await merger.saveAsBuffer();
                            aws.saveToS3WithName(mergedPdfBuffer , 'MergeInvoice' , 'application/pdf' , 'pdf').then((result) => {
                                let data = {
                                    path: result.data.Key,
                                };
                                return responseManager.onSuccess('Label generated successfully...!' , data , res);
                            }).catch((error) => {
                                return responseManager.onError(error , res);
                            });
                        })().catch((error) => {
                            return responseManager.onError(error , res);
                        });
                    });
                }else{
                    return responseManager.onError('Unable to get invoice settings data, Please try later...!', res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid order id to get order details...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;