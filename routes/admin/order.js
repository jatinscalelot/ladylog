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
                                    if(orderData.financial_status === 'paid'){
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
                                        async.forEachSeries(orderData.veriants, (veriant , next_veriant) => {
                                            ( async () => {
                                                let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriant.veriant).lean();
                                                let obj = {
                                                    stock: parseInt(veriantData.stock + veriant.quantity)
                                                };
                                                let updatedVeriantData = await primary.model(constants.MODELS.veriants, veriantModel).findByIdAndUpdate(veriantData._id , obj , {returnOriginal: false}).lean();
                                                next_veriant();
                                            })().catch((error) => {
                                                return responseManager.onError(error , res);
                                            });
                                        }, () => {
                                            next_orderId();
                                        });
                                    }else{
                                        let obj = {
                                            fullfill_status: 'cancelled',
                                            cancelledAt: new Date(),
                                            cancelled_timestamp: Date.now(),
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let cancelledOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                        async.forEachSeries(orderData.veriants, (veriant , next_veriant) => {
                                            ( async () => {
                                                let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriant.veriant).lean();
                                                let obj = {
                                                    stock: parseInt(veriantData.stock + veriant.quantity)
                                                };
                                                let updatedVeriantData = await primary.model(constants.MODELS.veriants, veriantModel).findByIdAndUpdate(veriantData._id , obj , {returnOriginal: false}).lean();
                                                next_veriant();
                                            })().catch((error) => {
                                                return responseManager.onError(error , res);
                                            });
                                        }, () => {
                                            next_orderId();
                                        });
                                    }
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
                                    if(orderData.financial_status === 'paid'){
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
                let codSVG = '<svg xmlns="http://www.w3.org/2000/svg" style="width:100%;margin-left:-48px;overflow: visible;" height="48" viewBox="0 0 592 48" fill="none"> <rect style="width:684px" height="48" fill="black"/> <path d="M21.774 23.718C21.774 22.494 22.05 21.396 22.602 20.424C23.154 19.44 23.904 18.672 24.852 18.12C25.812 17.568 26.874 17.292 28.038 17.292C29.406 17.292 30.6 17.622 31.62 18.282C32.64 18.942 33.384 19.878 33.852 21.09H31.89C31.542 20.334 31.038 19.752 30.378 19.344C29.73 18.936 28.95 18.732 28.038 18.732C27.162 18.732 26.376 18.936 25.68 19.344C24.984 19.752 24.438 20.334 24.042 21.09C23.646 21.834 23.448 22.71 23.448 23.718C23.448 24.714 23.646 25.59 24.042 26.346C24.438 27.09 24.984 27.666 25.68 28.074C26.376 28.482 27.162 28.686 28.038 28.686C28.95 28.686 29.73 28.488 30.378 28.092C31.038 27.684 31.542 27.102 31.89 26.346H33.852C33.384 27.546 32.64 28.476 31.62 29.136C30.6 29.784 29.406 30.108 28.038 30.108C26.874 30.108 25.812 29.838 24.852 29.298C23.904 28.746 23.154 27.984 22.602 27.012C22.05 26.04 21.774 24.942 21.774 23.718ZM41.9783 30.126C40.8143 30.126 39.7523 29.856 38.7923 29.316C37.8323 28.764 37.0703 28.002 36.5063 27.03C35.9543 26.046 35.6783 24.942 35.6783 23.718C35.6783 22.494 35.9543 21.396 36.5063 20.424C37.0703 19.44 37.8323 18.678 38.7923 18.138C39.7523 17.586 40.8143 17.31 41.9783 17.31C43.1543 17.31 44.2223 17.586 45.1823 18.138C46.1423 18.678 46.8983 19.434 47.4503 20.406C48.0023 21.378 48.2783 22.482 48.2783 23.718C48.2783 24.954 48.0023 26.058 47.4503 27.03C46.8983 28.002 46.1423 28.764 45.1823 29.316C44.2223 29.856 43.1543 30.126 41.9783 30.126ZM41.9783 28.704C42.8543 28.704 43.6403 28.5 44.3363 28.092C45.0443 27.684 45.5963 27.102 45.9923 26.346C46.4003 25.59 46.6043 24.714 46.6043 23.718C46.6043 22.71 46.4003 21.834 45.9923 21.09C45.5963 20.334 45.0503 19.752 44.3543 19.344C43.6583 18.936 42.8663 18.732 41.9783 18.732C41.0903 18.732 40.2983 18.936 39.6023 19.344C38.9063 19.752 38.3543 20.334 37.9463 21.09C37.5503 21.834 37.3523 22.71 37.3523 23.718C37.3523 24.714 37.5503 25.59 37.9463 26.346C38.3543 27.102 38.9063 27.684 39.6023 28.092C40.3103 28.5 41.1023 28.704 41.9783 28.704ZM54.3467 17.454C55.7147 17.454 56.8967 17.712 57.8927 18.228C58.9007 18.732 59.6687 19.458 60.1967 20.406C60.7367 21.354 61.0067 22.47 61.0067 23.754C61.0067 25.038 60.7367 26.154 60.1967 27.102C59.6687 28.038 58.9007 28.758 57.8927 29.262C56.8967 29.754 55.7147 30 54.3467 30H50.4407V17.454H54.3467ZM54.3467 28.65C55.9667 28.65 57.2027 28.224 58.0547 27.372C58.9067 26.508 59.3327 25.302 59.3327 23.754C59.3327 22.194 58.9007 20.976 58.0367 20.1C57.1847 19.224 55.9547 18.786 54.3467 18.786H52.0787V28.65H54.3467ZM68.4881 30.108C68.1761 30.108 67.9121 30 67.6961 29.784C67.4801 29.568 67.3721 29.304 67.3721 28.992C67.3721 28.68 67.4801 28.416 67.6961 28.2C67.9121 27.984 68.1761 27.876 68.4881 27.876C68.7881 27.876 69.0401 27.984 69.2441 28.2C69.4601 28.416 69.5681 28.68 69.5681 28.992C69.5681 29.304 69.4601 29.568 69.2441 29.784C69.0401 30 68.7881 30.108 68.4881 30.108ZM68.4881 22.404C68.1761 22.404 67.9121 22.296 67.6961 22.08C67.4801 21.864 67.3721 21.6 67.3721 21.288C67.3721 20.976 67.4801 20.712 67.6961 20.496C67.9121 20.28 68.1761 20.172 68.4881 20.172C68.7881 20.172 69.0401 20.28 69.2441 20.496C69.4601 20.712 69.5681 20.976 69.5681 21.288C69.5681 21.6 69.4601 21.864 69.2441 22.08C69.0401 22.296 68.7881 22.404 68.4881 22.404ZM75.9849 23.718C75.9849 22.494 76.2609 21.396 76.8129 20.424C77.3649 19.44 78.1149 18.672 79.0629 18.12C80.0229 17.568 81.0849 17.292 82.2489 17.292C83.6169 17.292 84.8109 17.622 85.8309 18.282C86.8509 18.942 87.5949 19.878 88.0629 21.09H86.1009C85.7529 20.334 85.2489 19.752 84.5889 19.344C83.9409 18.936 83.1609 18.732 82.2489 18.732C81.3729 18.732 80.5869 18.936 79.8909 19.344C79.1949 19.752 78.6489 20.334 78.2529 21.09C77.8569 21.834 77.6589 22.71 77.6589 23.718C77.6589 24.714 77.8569 25.59 78.2529 26.346C78.6489 27.09 79.1949 27.666 79.8909 28.074C80.5869 28.482 81.3729 28.686 82.2489 28.686C83.1609 28.686 83.9409 28.488 84.5889 28.092C85.2489 27.684 85.7529 27.102 86.1009 26.346H88.0629C87.5949 27.546 86.8509 28.476 85.8309 29.136C84.8109 29.784 83.6169 30.108 82.2489 30.108C81.0849 30.108 80.0229 29.838 79.0629 29.298C78.1149 28.746 77.3649 27.984 76.8129 27.012C76.2609 26.04 75.9849 24.942 75.9849 23.718ZM95.3972 19.956C96.1412 19.956 96.8132 20.118 97.4132 20.442C98.0132 20.754 98.4812 21.228 98.8172 21.864C99.1652 22.5 99.3392 23.274 99.3392 24.186V30H97.7192V24.42C97.7192 23.436 97.4732 22.686 96.9812 22.17C96.4892 21.642 95.8172 21.378 94.9652 21.378C94.1012 21.378 93.4112 21.648 92.8952 22.188C92.3912 22.728 92.1392 23.514 92.1392 24.546V30H90.5012V16.68H92.1392V21.54C92.4632 21.036 92.9072 20.646 93.4712 20.37C94.0472 20.094 94.6892 19.956 95.3972 19.956ZM111.015 24.69C111.015 25.002 110.997 25.332 110.961 25.68H103.077C103.137 26.652 103.467 27.414 104.067 27.966C104.679 28.506 105.417 28.776 106.281 28.776C106.989 28.776 107.577 28.614 108.045 28.29C108.525 27.954 108.861 27.51 109.053 26.958H110.817C110.553 27.906 110.025 28.68 109.233 29.28C108.441 29.868 107.457 30.162 106.281 30.162C105.345 30.162 104.505 29.952 103.761 29.532C103.029 29.112 102.453 28.518 102.033 27.75C101.613 26.97 101.403 26.07 101.403 25.05C101.403 24.03 101.607 23.136 102.015 22.368C102.423 21.6 102.993 21.012 103.725 20.604C104.469 20.184 105.321 19.974 106.281 19.974C107.217 19.974 108.045 20.178 108.765 20.586C109.485 20.994 110.037 21.558 110.421 22.278C110.817 22.986 111.015 23.79 111.015 24.69ZM109.323 24.348C109.323 23.724 109.185 23.19 108.909 22.746C108.633 22.29 108.255 21.948 107.775 21.72C107.307 21.48 106.785 21.36 106.209 21.36C105.381 21.36 104.673 21.624 104.085 22.152C103.509 22.68 103.179 23.412 103.095 24.348H109.323ZM112.565 25.05C112.565 24.03 112.769 23.142 113.177 22.386C113.585 21.618 114.149 21.024 114.869 20.604C115.601 20.184 116.435 19.974 117.371 19.974C118.583 19.974 119.579 20.268 120.359 20.856C121.151 21.444 121.673 22.26 121.925 23.304H120.161C119.993 22.704 119.663 22.23 119.171 21.882C118.691 21.534 118.091 21.36 117.371 21.36C116.435 21.36 115.679 21.684 115.103 22.332C114.527 22.968 114.239 23.874 114.239 25.05C114.239 26.238 114.527 27.156 115.103 27.804C115.679 28.452 116.435 28.776 117.371 28.776C118.091 28.776 118.691 28.608 119.171 28.272C119.651 27.936 119.981 27.456 120.161 26.832H121.925C121.661 27.84 121.133 28.65 120.341 29.262C119.549 29.862 118.559 30.162 117.371 30.162C116.435 30.162 115.601 29.952 114.869 29.532C114.149 29.112 113.585 28.518 113.177 27.75C112.769 26.982 112.565 26.082 112.565 25.05ZM129.619 30L125.749 25.644V30H124.111V16.68H125.749V24.51L129.547 20.136H131.833L127.189 25.05L131.851 30H129.619ZM140.171 21.486V27.3C140.171 27.78 140.273 28.122 140.477 28.326C140.681 28.518 141.035 28.614 141.539 28.614H142.745V30H141.269C140.357 30 139.673 29.79 139.217 29.37C138.761 28.95 138.533 28.26 138.533 27.3V21.486H137.255V20.136H138.533V17.652H140.171V20.136H142.745V21.486H140.171ZM149.626 19.956C150.37 19.956 151.042 20.118 151.642 20.442C152.242 20.754 152.71 21.228 153.046 21.864C153.394 22.5 153.568 23.274 153.568 24.186V30H151.948V24.42C151.948 23.436 151.702 22.686 151.21 22.17C150.718 21.642 150.046 21.378 149.194 21.378C148.33 21.378 147.64 21.648 147.124 22.188C146.62 22.728 146.368 23.514 146.368 24.546V30H144.73V16.68H146.368V21.54C146.692 21.036 147.136 20.646 147.7 20.37C148.276 20.094 148.918 19.956 149.626 19.956ZM165.243 24.69C165.243 25.002 165.225 25.332 165.189 25.68H157.305C157.365 26.652 157.695 27.414 158.295 27.966C158.907 28.506 159.645 28.776 160.509 28.776C161.217 28.776 161.805 28.614 162.273 28.29C162.753 27.954 163.089 27.51 163.281 26.958H165.045C164.781 27.906 164.253 28.68 163.461 29.28C162.669 29.868 161.685 30.162 160.509 30.162C159.573 30.162 158.733 29.952 157.989 29.532C157.257 29.112 156.681 28.518 156.261 27.75C155.841 26.97 155.631 26.07 155.631 25.05C155.631 24.03 155.835 23.136 156.243 22.368C156.651 21.6 157.221 21.012 157.953 20.604C158.697 20.184 159.549 19.974 160.509 19.974C161.445 19.974 162.273 20.178 162.993 20.586C163.713 20.994 164.265 21.558 164.649 22.278C165.045 22.986 165.243 23.79 165.243 24.69ZM163.551 24.348C163.551 23.724 163.413 23.19 163.137 22.746C162.861 22.29 162.483 21.948 162.003 21.72C161.535 21.48 161.013 21.36 160.437 21.36C159.609 21.36 158.901 21.624 158.313 22.152C157.737 22.68 157.407 23.412 157.323 24.348H163.551ZM173.842 21.954C174.166 21.39 174.646 20.922 175.282 20.55C175.93 20.166 176.68 19.974 177.532 19.974C178.408 19.974 179.2 20.184 179.908 20.604C180.628 21.024 181.192 21.618 181.6 22.386C182.008 23.142 182.212 24.024 182.212 25.032C182.212 26.028 182.008 26.916 181.6 27.696C181.192 28.476 180.628 29.082 179.908 29.514C179.2 29.946 178.408 30.162 177.532 30.162C176.692 30.162 175.948 29.976 175.3 29.604C174.664 29.22 174.178 28.746 173.842 28.182V34.68H172.204V20.136H173.842V21.954ZM180.538 25.032C180.538 24.288 180.388 23.64 180.088 23.088C179.788 22.536 179.38 22.116 178.864 21.828C178.36 21.54 177.802 21.396 177.19 21.396C176.59 21.396 176.032 21.546 175.516 21.846C175.012 22.134 174.604 22.56 174.292 23.124C173.992 23.676 173.842 24.318 173.842 25.05C173.842 25.794 173.992 26.448 174.292 27.012C174.604 27.564 175.012 27.99 175.516 28.29C176.032 28.578 176.59 28.722 177.19 28.722C177.802 28.722 178.36 28.578 178.864 28.29C179.38 27.99 179.788 27.564 180.088 27.012C180.388 26.448 180.538 25.788 180.538 25.032ZM183.756 25.032C183.756 24.024 183.96 23.142 184.368 22.386C184.776 21.618 185.334 21.024 186.042 20.604C186.762 20.184 187.56 19.974 188.436 19.974C189.3 19.974 190.05 20.16 190.686 20.532C191.322 20.904 191.796 21.372 192.108 21.936V20.136H193.764V30H192.108V28.164C191.784 28.74 191.298 29.22 190.65 29.604C190.014 29.976 189.27 30.162 188.418 30.162C187.542 30.162 186.75 29.946 186.042 29.514C185.334 29.082 184.776 28.476 184.368 27.696C183.96 26.916 183.756 26.028 183.756 25.032ZM192.108 25.05C192.108 24.306 191.958 23.658 191.658 23.106C191.358 22.554 190.95 22.134 190.434 21.846C189.93 21.546 189.372 21.396 188.76 21.396C188.148 21.396 187.59 21.54 187.086 21.828C186.582 22.116 186.18 22.536 185.88 23.088C185.58 23.64 185.43 24.288 185.43 25.032C185.43 25.788 185.58 26.448 185.88 27.012C186.18 27.564 186.582 27.99 187.086 28.29C187.59 28.578 188.148 28.722 188.76 28.722C189.372 28.722 189.93 28.578 190.434 28.29C190.95 27.99 191.358 27.564 191.658 27.012C191.958 26.448 192.108 25.794 192.108 25.05ZM205.028 20.136L199.088 34.644H197.396L199.34 29.892L195.362 20.136H197.18L200.276 28.128L203.336 20.136H205.028ZM206.063 25.032C206.063 24.024 206.267 23.142 206.675 22.386C207.083 21.618 207.641 21.024 208.349 20.604C209.069 20.184 209.867 19.974 210.743 19.974C211.607 19.974 212.357 20.16 212.993 20.532C213.629 20.904 214.103 21.372 214.415 21.936V20.136H216.071V30H214.415V28.164C214.091 28.74 213.605 29.22 212.957 29.604C212.321 29.976 211.577 30.162 210.725 30.162C209.849 30.162 209.057 29.946 208.349 29.514C207.641 29.082 207.083 28.476 206.675 27.696C206.267 26.916 206.063 26.028 206.063 25.032ZM214.415 25.05C214.415 24.306 214.265 23.658 213.965 23.106C213.665 22.554 213.257 22.134 212.741 21.846C212.237 21.546 211.679 21.396 211.067 21.396C210.455 21.396 209.897 21.54 209.393 21.828C208.889 22.116 208.487 22.536 208.187 23.088C207.887 23.64 207.737 24.288 207.737 25.032C207.737 25.788 207.887 26.448 208.187 27.012C208.487 27.564 208.889 27.99 209.393 28.29C209.897 28.578 210.455 28.722 211.067 28.722C211.679 28.722 212.237 28.578 212.741 28.29C213.257 27.99 213.665 27.564 213.965 27.012C214.265 26.448 214.415 25.794 214.415 25.05ZM220.477 21.972C220.813 21.384 221.305 20.904 221.953 20.532C222.601 20.16 223.339 19.974 224.167 19.974C225.055 19.974 225.853 20.184 226.561 20.604C227.269 21.024 227.827 21.618 228.235 22.386C228.643 23.142 228.847 24.024 228.847 25.032C228.847 26.028 228.643 26.916 228.235 27.696C227.827 28.476 227.263 29.082 226.543 29.514C225.835 29.946 225.043 30.162 224.167 30.162C223.315 30.162 222.565 29.976 221.917 29.604C221.281 29.232 220.801 28.758 220.477 28.182V30H218.839V16.68H220.477V21.972ZM227.173 25.032C227.173 24.288 227.023 23.64 226.723 23.088C226.423 22.536 226.015 22.116 225.499 21.828C224.995 21.54 224.437 21.396 223.825 21.396C223.225 21.396 222.667 21.546 222.151 21.846C221.647 22.134 221.239 22.56 220.927 23.124C220.627 23.676 220.477 24.318 220.477 25.05C220.477 25.794 220.627 26.448 220.927 27.012C221.239 27.564 221.647 27.99 222.151 28.29C222.667 28.578 223.225 28.722 223.825 28.722C224.437 28.722 224.995 28.578 225.499 28.29C226.015 27.99 226.423 27.564 226.723 27.012C227.023 26.448 227.173 25.788 227.173 25.032ZM232.641 16.68V30H231.003V16.68H232.641ZM244.433 24.69C244.433 25.002 244.415 25.332 244.379 25.68H236.495C236.555 26.652 236.885 27.414 237.485 27.966C238.097 28.506 238.835 28.776 239.699 28.776C240.407 28.776 240.995 28.614 241.463 28.29C241.943 27.954 242.279 27.51 242.471 26.958H244.235C243.971 27.906 243.443 28.68 242.651 29.28C241.859 29.868 240.875 30.162 239.699 30.162C238.763 30.162 237.923 29.952 237.179 29.532C236.447 29.112 235.871 28.518 235.451 27.75C235.031 26.97 234.821 26.07 234.821 25.05C234.821 24.03 235.025 23.136 235.433 22.368C235.841 21.6 236.411 21.012 237.143 20.604C237.887 20.184 238.739 19.974 239.699 19.974C240.635 19.974 241.463 20.178 242.183 20.586C242.903 20.994 243.455 21.558 243.839 22.278C244.235 22.986 244.433 23.79 244.433 24.69ZM242.741 24.348C242.741 23.724 242.603 23.19 242.327 22.746C242.051 22.29 241.673 21.948 241.193 21.72C240.725 21.48 240.203 21.36 239.627 21.36C238.799 21.36 238.091 21.624 237.503 22.152C236.927 22.68 236.597 23.412 236.513 24.348H242.741ZM250.782 25.032C250.782 24.024 250.986 23.142 251.394 22.386C251.802 21.618 252.36 21.024 253.068 20.604C253.788 20.184 254.586 19.974 255.462 19.974C256.326 19.974 257.076 20.16 257.712 20.532C258.348 20.904 258.822 21.372 259.134 21.936V20.136H260.79V30H259.134V28.164C258.81 28.74 258.324 29.22 257.676 29.604C257.04 29.976 256.296 30.162 255.444 30.162C254.568 30.162 253.776 29.946 253.068 29.514C252.36 29.082 251.802 28.476 251.394 27.696C250.986 26.916 250.782 26.028 250.782 25.032ZM259.134 25.05C259.134 24.306 258.984 23.658 258.684 23.106C258.384 22.554 257.976 22.134 257.46 21.846C256.956 21.546 256.398 21.396 255.786 21.396C255.174 21.396 254.616 21.54 254.112 21.828C253.608 22.116 253.206 22.536 252.906 23.088C252.606 23.64 252.456 24.288 252.456 25.032C252.456 25.788 252.606 26.448 252.906 27.012C253.206 27.564 253.608 27.99 254.112 28.29C254.616 28.578 255.174 28.722 255.786 28.722C256.398 28.722 256.956 28.578 257.46 28.29C257.976 27.99 258.384 27.564 258.684 27.012C258.984 26.448 259.134 25.794 259.134 25.05ZM275.42 19.956C276.188 19.956 276.872 20.118 277.472 20.442C278.072 20.754 278.546 21.228 278.894 21.864C279.242 22.5 279.416 23.274 279.416 24.186V30H277.796V24.42C277.796 23.436 277.55 22.686 277.058 22.17C276.578 21.642 275.924 21.378 275.096 21.378C274.244 21.378 273.566 21.654 273.062 22.206C272.558 22.746 272.306 23.532 272.306 24.564V30H270.686V24.42C270.686 23.436 270.44 22.686 269.948 22.17C269.468 21.642 268.814 21.378 267.986 21.378C267.134 21.378 266.456 21.654 265.952 22.206C265.448 22.746 265.196 23.532 265.196 24.564V30H263.558V20.136H265.196V21.558C265.52 21.042 265.952 20.646 266.492 20.37C267.044 20.094 267.65 19.956 268.31 19.956C269.138 19.956 269.87 20.142 270.506 20.514C271.142 20.886 271.616 21.432 271.928 22.152C272.204 21.456 272.66 20.916 273.296 20.532C273.932 20.148 274.64 19.956 275.42 19.956ZM286.405 30.162C285.481 30.162 284.641 29.952 283.885 29.532C283.141 29.112 282.553 28.518 282.121 27.75C281.701 26.97 281.491 26.07 281.491 25.05C281.491 24.042 281.707 23.154 282.139 22.386C282.583 21.606 283.183 21.012 283.939 20.604C284.695 20.184 285.541 19.974 286.477 19.974C287.413 19.974 288.259 20.184 289.015 20.604C289.771 21.012 290.365 21.6 290.797 22.368C291.241 23.136 291.463 24.03 291.463 25.05C291.463 26.07 291.235 26.97 290.779 27.75C290.335 28.518 289.729 29.112 288.961 29.532C288.193 29.952 287.341 30.162 286.405 30.162ZM286.405 28.722C286.993 28.722 287.545 28.584 288.061 28.308C288.577 28.032 288.991 27.618 289.303 27.066C289.627 26.514 289.789 25.842 289.789 25.05C289.789 24.258 289.633 23.586 289.321 23.034C289.009 22.482 288.601 22.074 288.097 21.81C287.593 21.534 287.047 21.396 286.459 21.396C285.859 21.396 285.307 21.534 284.803 21.81C284.311 22.074 283.915 22.482 283.615 23.034C283.315 23.586 283.165 24.258 283.165 25.05C283.165 25.854 283.309 26.532 283.597 27.084C283.897 27.636 284.293 28.05 284.785 28.326C285.277 28.59 285.817 28.722 286.405 28.722ZM302.364 20.136V30H300.726V28.542C300.414 29.046 299.976 29.442 299.412 29.73C298.86 30.006 298.248 30.144 297.576 30.144C296.808 30.144 296.118 29.988 295.506 29.676C294.894 29.352 294.408 28.872 294.048 28.236C293.7 27.6 293.526 26.826 293.526 25.914V20.136H295.146V25.698C295.146 26.67 295.392 27.42 295.884 27.948C296.376 28.464 297.048 28.722 297.9 28.722C298.776 28.722 299.466 28.452 299.97 27.912C300.474 27.372 300.726 26.586 300.726 25.554V20.136H302.364ZM309.936 19.956C311.136 19.956 312.108 20.322 312.852 21.054C313.596 21.774 313.968 22.818 313.968 24.186V30H312.348V24.42C312.348 23.436 312.102 22.686 311.61 22.17C311.118 21.642 310.446 21.378 309.594 21.378C308.73 21.378 308.04 21.648 307.524 22.188C307.02 22.728 306.768 23.514 306.768 24.546V30H305.13V20.136H306.768V21.54C307.092 21.036 307.53 20.646 308.082 20.37C308.646 20.094 309.264 19.956 309.936 19.956ZM318.642 21.486V27.3C318.642 27.78 318.744 28.122 318.948 28.326C319.152 28.518 319.506 28.614 320.01 28.614H321.216V30H319.74C318.828 30 318.144 29.79 317.688 29.37C317.232 28.95 317.004 28.26 317.004 27.3V21.486H315.726V20.136H317.004V17.652H318.642V20.136H321.216V21.486H318.642ZM332.301 30.162C331.377 30.162 330.537 29.952 329.781 29.532C329.037 29.112 328.449 28.518 328.017 27.75C327.597 26.97 327.387 26.07 327.387 25.05C327.387 24.042 327.603 23.154 328.035 22.386C328.479 21.606 329.079 21.012 329.835 20.604C330.591 20.184 331.437 19.974 332.373 19.974C333.309 19.974 334.155 20.184 334.911 20.604C335.667 21.012 336.261 21.6 336.693 22.368C337.137 23.136 337.359 24.03 337.359 25.05C337.359 26.07 337.131 26.97 336.675 27.75C336.231 28.518 335.625 29.112 334.857 29.532C334.089 29.952 333.237 30.162 332.301 30.162ZM332.301 28.722C332.889 28.722 333.441 28.584 333.957 28.308C334.473 28.032 334.887 27.618 335.199 27.066C335.523 26.514 335.685 25.842 335.685 25.05C335.685 24.258 335.529 23.586 335.217 23.034C334.905 22.482 334.497 22.074 333.993 21.81C333.489 21.534 332.943 21.396 332.355 21.396C331.755 21.396 331.203 21.534 330.699 21.81C330.207 22.074 329.811 22.482 329.511 23.034C329.211 23.586 329.061 24.258 329.061 25.05C329.061 25.854 329.205 26.532 329.493 27.084C329.793 27.636 330.189 28.05 330.681 28.326C331.173 28.59 331.713 28.722 332.301 28.722ZM344.319 19.956C345.519 19.956 346.491 20.322 347.235 21.054C347.979 21.774 348.351 22.818 348.351 24.186V30H346.731V24.42C346.731 23.436 346.485 22.686 345.993 22.17C345.501 21.642 344.829 21.378 343.977 21.378C343.113 21.378 342.423 21.648 341.907 22.188C341.403 22.728 341.151 23.514 341.151 24.546V30H339.513V20.136H341.151V21.54C341.475 21.036 341.913 20.646 342.465 20.37C343.029 20.094 343.647 19.956 344.319 19.956ZM357.823 21.486V27.3C357.823 27.78 357.925 28.122 358.129 28.326C358.333 28.518 358.687 28.614 359.191 28.614H360.397V30H358.921C358.009 30 357.325 29.79 356.869 29.37C356.413 28.95 356.185 28.26 356.185 27.3V21.486H354.907V20.136H356.185V17.652H357.823V20.136H360.397V21.486H357.823ZM367.278 19.956C368.022 19.956 368.694 20.118 369.294 20.442C369.894 20.754 370.362 21.228 370.698 21.864C371.046 22.5 371.22 23.274 371.22 24.186V30H369.6V24.42C369.6 23.436 369.354 22.686 368.862 22.17C368.37 21.642 367.698 21.378 366.846 21.378C365.982 21.378 365.292 21.648 364.776 22.188C364.272 22.728 364.02 23.514 364.02 24.546V30H362.382V16.68H364.02V21.54C364.344 21.036 364.788 20.646 365.352 20.37C365.928 20.094 366.57 19.956 367.278 19.956ZM382.896 24.69C382.896 25.002 382.878 25.332 382.842 25.68H374.958C375.018 26.652 375.348 27.414 375.948 27.966C376.56 28.506 377.298 28.776 378.162 28.776C378.87 28.776 379.458 28.614 379.926 28.29C380.406 27.954 380.742 27.51 380.934 26.958H382.698C382.434 27.906 381.906 28.68 381.114 29.28C380.322 29.868 379.338 30.162 378.162 30.162C377.226 30.162 376.386 29.952 375.642 29.532C374.91 29.112 374.334 28.518 373.914 27.75C373.494 26.97 373.284 26.07 373.284 25.05C373.284 24.03 373.488 23.136 373.896 22.368C374.304 21.6 374.874 21.012 375.606 20.604C376.35 20.184 377.202 19.974 378.162 19.974C379.098 19.974 379.926 20.178 380.646 20.586C381.366 20.994 381.918 21.558 382.302 22.278C382.698 22.986 382.896 23.79 382.896 24.69ZM381.204 24.348C381.204 23.724 381.066 23.19 380.79 22.746C380.514 22.29 380.136 21.948 379.656 21.72C379.188 21.48 378.666 21.36 378.09 21.36C377.262 21.36 376.554 21.624 375.966 22.152C375.39 22.68 375.06 23.412 374.976 24.348H381.204ZM389.245 25.032C389.245 24.024 389.449 23.142 389.857 22.386C390.265 21.618 390.823 21.024 391.531 20.604C392.251 20.184 393.049 19.974 393.925 19.974C394.789 19.974 395.539 20.16 396.175 20.532C396.811 20.904 397.285 21.372 397.597 21.936V20.136H399.253V30H397.597V28.164C397.273 28.74 396.787 29.22 396.139 29.604C395.503 29.976 394.759 30.162 393.907 30.162C393.031 30.162 392.239 29.946 391.531 29.514C390.823 29.082 390.265 28.476 389.857 27.696C389.449 26.916 389.245 26.028 389.245 25.032ZM397.597 25.05C397.597 24.306 397.447 23.658 397.147 23.106C396.847 22.554 396.439 22.134 395.923 21.846C395.419 21.546 394.861 21.396 394.249 21.396C393.637 21.396 393.079 21.54 392.575 21.828C392.071 22.116 391.669 22.536 391.369 23.088C391.069 23.64 390.919 24.288 390.919 25.032C390.919 25.788 391.069 26.448 391.369 27.012C391.669 27.564 392.071 27.99 392.575 28.29C393.079 28.578 393.637 28.722 394.249 28.722C394.861 28.722 395.419 28.578 395.923 28.29C396.439 27.99 396.847 27.564 397.147 27.012C397.447 26.448 397.597 25.794 397.597 25.05ZM403.659 21.954C403.983 21.39 404.463 20.922 405.099 20.55C405.747 20.166 406.497 19.974 407.349 19.974C408.225 19.974 409.017 20.184 409.725 20.604C410.445 21.024 411.009 21.618 411.417 22.386C411.825 23.142 412.029 24.024 412.029 25.032C412.029 26.028 411.825 26.916 411.417 27.696C411.009 28.476 410.445 29.082 409.725 29.514C409.017 29.946 408.225 30.162 407.349 30.162C406.509 30.162 405.765 29.976 405.117 29.604C404.481 29.22 403.995 28.746 403.659 28.182V34.68H402.021V20.136H403.659V21.954ZM410.355 25.032C410.355 24.288 410.205 23.64 409.905 23.088C409.605 22.536 409.197 22.116 408.681 21.828C408.177 21.54 407.619 21.396 407.007 21.396C406.407 21.396 405.849 21.546 405.333 21.846C404.829 22.134 404.421 22.56 404.109 23.124C403.809 23.676 403.659 24.318 403.659 25.05C403.659 25.794 403.809 26.448 404.109 27.012C404.421 27.564 404.829 27.99 405.333 28.29C405.849 28.578 406.407 28.722 407.007 28.722C407.619 28.722 408.177 28.578 408.681 28.29C409.197 27.99 409.605 27.564 409.905 27.012C410.205 26.448 410.355 25.788 410.355 25.032ZM415.823 21.954C416.147 21.39 416.627 20.922 417.263 20.55C417.911 20.166 418.661 19.974 419.513 19.974C420.389 19.974 421.181 20.184 421.889 20.604C422.609 21.024 423.173 21.618 423.581 22.386C423.989 23.142 424.193 24.024 424.193 25.032C424.193 26.028 423.989 26.916 423.581 27.696C423.173 28.476 422.609 29.082 421.889 29.514C421.181 29.946 420.389 30.162 419.513 30.162C418.673 30.162 417.929 29.976 417.281 29.604C416.645 29.22 416.159 28.746 415.823 28.182V34.68H414.185V20.136H415.823V21.954ZM422.519 25.032C422.519 24.288 422.369 23.64 422.069 23.088C421.769 22.536 421.361 22.116 420.845 21.828C420.341 21.54 419.783 21.396 419.171 21.396C418.571 21.396 418.013 21.546 417.497 21.846C416.993 22.134 416.585 22.56 416.273 23.124C415.973 23.676 415.823 24.318 415.823 25.05C415.823 25.794 415.973 26.448 416.273 27.012C416.585 27.564 416.993 27.99 417.497 28.29C418.013 28.578 418.571 28.722 419.171 28.722C419.783 28.722 420.341 28.578 420.845 28.29C421.361 27.99 421.769 27.564 422.069 27.012C422.369 26.448 422.519 25.788 422.519 25.032Z" fill="white"/> </svg>';
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
                                                                /* Set padding for page breaks */
                                                                table.page-break {
                                                                    page-break-after: always !important;
                                                                    padding-top: 20px !important; /* Adjust as needed */
                                                                }
                                                                @media print {
                                                                    /* Set padding for page breaks */
                                                                    table.page-break {
                                                                        page-break-after: always !important;
                                                                        padding-top: 20px !important; /* Adjust as needed */
                                                                    }
                                                                }
                                                            </style>
                                                            </head>
                                                            <body>
                                                                <table class="page-break" style="width: 1024px;margin: 0 auto;border: none;font-family: Arial, sans-serif;" border="1" cellspacing="10" cellpadding="0">
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
                                                                                                <span style="display: block;width: 100%;font-size: 16px;font-weight: 500;letter-spacing: 1.1px;">${orderData.createdBy.name} ${orderData.addressId.floor_no}, ${orderData.addressId.building_name}, ${orderData.addressId.city}, ${orderData.addressId.state}, ${orderData.addressId.country}-${orderData.addressId.pincode}</span>
                                                                                                <span style="display: block;width: 100%;font-size: 16px;font-weight: 600;padding-top: 5px;">+919723631058</span>
                                                                                                </td>
                                                                                                <td width="70%" style="vertical-align: top;padding: 0;border:2px solid black;" rowspan="2">
                                                                                                <table style="width: 100%;border-spacing: 0;">
                                                                                                    <tbody>
                                                                                                    <tr>
                                                                                                        <td style="padding: 0;overflow: hidden;padding-bottom: 15px;">
                                                                                                        ${orderData.financial_status === 'cod' ? codSVG : ''}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                    <tr>
                                                                                                        <td style="padding: 16px;padding-top: 0;">
                                                                                                        <table style="width: 100%;border-spacing: 0;">
                                                                                                            <tr>
                                                                                                            <td style="font-size: 14px;font-weight: 500;padding: 0;"><span style="font-weight: 600;">Order No : </span>${orderData.orderId}</td>
                                                                                                            <td rowspan="5" style="text-align: -webkit-right; padding: 0;">
                                                                                                                <div style="width: 200px;height: 200px;">
                                                                                                                <img src=${orderData.QRcode} style="width: 100%;"></img>
                                                                                                                </div>
                                                                                                            </td>
                                                                                                            </tr>
                                                                                                            <tr>
                                                                                                            <td style="font-size: 14px;font-weight: 500;padding: 0;"><span style="font-weight: 600;">Order Date : </span>${orderDate}</td>
                                                                                                            </tr>
                                                                                                            <tr>
                                                                                                            <td style="font-size: 14px;font-weight: 500;padding: 0;"><span style="font-weight: 600;">Invoice No : </span>${orderData.invoiceNo}</td>
                                                                                                            </tr>
                                                                                                            <tr>
                                                                                                            <td style="font-size: 14px;font-weight: 500;padding: 0;"><span style="font-weight: 600;">Invoice Date : </span>${currentdate}</td>
                                                                                                            </tr>
                                                                                                            <tr>
                                                                                                            <td style="font-size: 14px;font-weight: 500;padding: 0;"><span style="font-weight: 600;">GSTIN : </span> ${invoiceSettingsData.gst_no}</td>
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
                                                                                            </tbody>
                                                                                        </table>
                                                                                        </td>
                                                                                    </tr>
                                                                                    <tr>
                                                                                        <td style="padding:0;">
                                                                                        <div style="display: flex;align-items: center;">
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="THANK_YOU_BANNER_1_" x="0px" y="0px" viewBox="0 0 547.96 263.75" style="enable-background:new 0 0 547.96 263.75;width:150px;height:110px;margin-left: auto;" xml:space="preserve"> <style type="text/css"> .st0{fill:#FFFFFF;} </style> <g> <path d="M57.62,23.11v3.61h-19V89.8h-4.28V26.72h-19v-3.61H57.62z"/> <path d="M117.18,23.11V89.8h-4.28V57.5H73.96v32.3h-4.28V23.11h4.28v30.78h38.95V23.11H117.18z"/> <path d="M172.56,72.7h-31.63l-6.37,17.1h-4.65l24.51-65.17h4.75l24.42,65.17h-4.66L172.56,72.7z M171.23,69.09L156.8,30.24   l-14.54,38.86H171.23z"/> <path d="M243.91,89.8h-4.28L200.5,30.14V89.8h-4.28V23.21h4.28l39.14,59.47V23.21h4.28V89.8z"/> <path d="M296.44,89.8l-30.68-31.45V89.8h-4.28V23.11h4.28v31.73l30.68-31.73h5.51l-32.49,33.44l32.59,33.25H296.44z"/> <path d="M383.65,23.11l-21,39.71V89.8h-4.27V62.82L337.2,23.11h4.85l18.43,35.72l18.33-35.72H383.65z"/> <path d="M405.5,87.33c-3.86-2.15-6.89-5.24-9.07-9.26c-2.18-4.02-3.28-8.72-3.28-14.11c0-5.32,1.11-9.99,3.33-14.01   c2.22-4.02,5.27-7.09,9.17-9.21c3.9-2.12,8.25-3.18,13.06-3.18c4.81,0,9.15,1.06,13.02,3.18c3.86,2.12,6.89,5.18,9.07,9.17   c2.18,3.99,3.28,8.68,3.28,14.06c0,5.38-1.11,10.09-3.33,14.11c-2.22,4.02-5.27,7.11-9.17,9.26c-3.9,2.15-8.25,3.23-13.06,3.23   C413.7,90.56,409.36,89.49,405.5,87.33z M429.01,84.24c3.26-1.68,5.87-4.23,7.84-7.65c1.96-3.42,2.95-7.63,2.95-12.63   c0-4.94-0.98-9.12-2.95-12.54c-1.96-3.42-4.56-5.97-7.79-7.65c-3.23-1.68-6.71-2.52-10.45-2.52c-3.74,0-7.21,0.84-10.4,2.52   c-3.2,1.68-5.78,4.23-7.74,7.65c-1.96,3.42-2.95,7.6-2.95,12.54c0,5,0.96,9.21,2.9,12.63c1.93,3.42,4.5,5.97,7.7,7.65   c3.2,1.68,6.67,2.52,10.4,2.52C422.25,86.76,425.75,85.92,429.01,84.24z"/> <path d="M502.59,38.22V89.8h-4.27V78.59c-1.46,3.93-3.88,6.92-7.27,8.98c-3.39,2.06-7.27,3.09-11.64,3.09   c-6.14,0-11.16-1.88-15.06-5.65c-3.89-3.77-5.84-9.36-5.84-16.77V38.22h4.18v29.74c0,6.14,1.55,10.85,4.66,14.11   c3.1,3.26,7.31,4.89,12.63,4.89c5.57,0,10.02-1.77,13.35-5.32c3.32-3.55,4.99-8.8,4.99-15.77V38.22H502.59z"/> <path d="M521.59,89.04c-0.7-0.7-1.04-1.58-1.04-2.66c0-1.08,0.35-1.96,1.04-2.66c0.7-0.7,1.58-1.04,2.66-1.04   c1.01,0,1.87,0.35,2.57,1.04c0.7,0.7,1.04,1.58,1.04,2.66c0,1.08-0.35,1.96-1.04,2.66c-0.7,0.7-1.55,1.04-2.57,1.04   C523.17,90.09,522.29,89.74,521.59,89.04z M526.34,23.11l-0.47,50.45h-3.71l-0.57-50.45H526.34z"/> </g> <g> <path d="M47.81,116.49v5.67h-18v12.5h14.03v5.67H29.82v18.54h-6.95v-42.39H47.81z"/> <path d="M63.95,156.53c-3.32-1.85-5.94-4.43-7.87-7.75c-1.93-3.31-2.9-7.05-2.9-11.19s0.97-7.87,2.9-11.16   c1.93-3.29,4.55-5.87,7.87-7.72c3.31-1.85,6.94-2.78,10.89-2.78c3.99,0,7.63,0.93,10.95,2.78c3.31,1.85,5.93,4.42,7.84,7.72   s2.87,7.02,2.87,11.16s-0.96,7.88-2.87,11.19s-4.52,5.9-7.84,7.75c-3.31,1.85-6.96,2.78-10.95,2.78   C70.89,159.31,67.26,158.38,63.95,156.53z M82.34,151.35c2.2-1.28,3.91-3.11,5.15-5.49c1.24-2.38,1.86-5.13,1.86-8.27   c0-3.13-0.62-5.88-1.86-8.23c-1.24-2.36-2.96-4.17-5.15-5.43c-2.2-1.26-4.7-1.89-7.5-1.89s-5.31,0.63-7.5,1.89   c-2.2,1.26-3.91,3.07-5.15,5.43c-1.24,2.36-1.86,5.1-1.86,8.23c0,3.13,0.62,5.89,1.86,8.27s2.96,4.21,5.15,5.49   c2.2,1.28,4.7,1.92,7.5,1.92S80.14,152.63,82.34,151.35z"/> <path d="M126.56,158.88l-9.76-16.96h-5.31v16.96h-6.95v-42.39h14.64c3.25,0,6.01,0.57,8.26,1.71c2.26,1.14,3.94,2.66,5.06,4.57   c1.12,1.91,1.68,4.05,1.68,6.4c0,2.77-0.8,5.28-2.41,7.53c-1.61,2.26-4.08,3.79-7.41,4.61l10.49,17.57H126.56z M111.49,136.37h7.69   c2.6,0,4.56-0.65,5.89-1.95c1.32-1.3,1.98-3.05,1.98-5.25s-0.65-3.91-1.95-5.15c-1.3-1.24-3.27-1.86-5.92-1.86h-7.69V136.37z"/> <path d="M192.8,116.49l-14.03,27.02v15.37h-6.95v-15.37l-14.09-27.02h7.75l9.82,20.8l9.82-20.8H192.8z"/> <path d="M207.96,156.53c-3.32-1.85-5.94-4.43-7.87-7.75c-1.93-3.31-2.9-7.05-2.9-11.19s0.97-7.87,2.9-11.16   c1.93-3.29,4.55-5.87,7.87-7.72c3.31-1.85,6.94-2.78,10.89-2.78c3.99,0,7.63,0.93,10.95,2.78c3.31,1.85,5.93,4.42,7.84,7.72   s2.87,7.02,2.87,11.16s-0.96,7.88-2.87,11.19s-4.52,5.9-7.84,7.75c-3.31,1.85-6.96,2.78-10.95,2.78   C214.91,159.31,211.28,158.38,207.96,156.53z M226.35,151.35c2.2-1.28,3.91-3.11,5.15-5.49c1.24-2.38,1.86-5.13,1.86-8.27   c0-3.13-0.62-5.88-1.86-8.23c-1.24-2.36-2.96-4.17-5.15-5.43c-2.2-1.26-4.7-1.89-7.5-1.89s-5.31,0.63-7.5,1.89   c-2.2,1.26-3.91,3.07-5.15,5.43c-1.24,2.36-1.86,5.1-1.86,8.23c0,3.13,0.62,5.89,1.86,8.27s2.96,4.21,5.15,5.49   c2.2,1.28,4.7,1.92,7.5,1.92S224.16,152.63,226.35,151.35z"/> <path d="M255.45,116.49v27.02c0,3.21,0.84,5.63,2.53,7.26c1.69,1.63,4.04,2.44,7.04,2.44c3.05,0,5.42-0.81,7.11-2.44   c1.69-1.63,2.53-4.05,2.53-7.26v-27.02h6.95v26.9c0,3.46-0.75,6.38-2.26,8.78c-1.5,2.4-3.52,4.19-6.04,5.37   c-2.52,1.18-5.31,1.77-8.36,1.77s-5.83-0.59-8.33-1.77c-2.5-1.18-4.48-2.97-5.95-5.37c-1.46-2.4-2.2-5.33-2.2-8.78v-26.9H255.45z"/> <path d="M313.88,158.88l-9.76-16.96h-5.31v16.96h-6.95v-42.39h14.64c3.25,0,6.01,0.57,8.26,1.71c2.26,1.14,3.94,2.66,5.06,4.57   c1.12,1.91,1.68,4.05,1.68,6.4c0,2.77-0.8,5.28-2.41,7.53c-1.61,2.26-4.08,3.79-7.41,4.61l10.49,17.57H313.88z M298.82,136.37h7.69   c2.6,0,4.56-0.65,5.89-1.95c1.32-1.3,1.98-3.05,1.98-5.25s-0.65-3.91-1.95-5.15c-1.3-1.24-3.27-1.86-5.92-1.86h-7.69V136.37z"/> <path d="M50.99,208.41c-1.02,1.91-2.64,3.47-4.88,4.67c-2.24,1.2-5.1,1.8-8.6,1.8h-7.69v17.2h-6.95v-42.39h14.64   c3.25,0,6.01,0.56,8.26,1.68c2.26,1.12,3.94,2.63,5.06,4.54c1.12,1.91,1.68,4.05,1.68,6.41C52.51,204.47,52,206.5,50.99,208.41z    M43.42,207.4c1.3-1.2,1.95-2.9,1.95-5.09c0-4.64-2.62-6.95-7.87-6.95h-7.69v13.85h7.69C40.15,209.2,42.12,208.6,43.42,207.4z"/> <path d="M67.27,189.68v27.02c0,3.21,0.84,5.63,2.53,7.26c1.69,1.63,4.04,2.44,7.04,2.44c3.05,0,5.42-0.81,7.11-2.44   c1.69-1.63,2.53-4.05,2.53-7.26v-27.02h6.95v26.9c0,3.46-0.75,6.38-2.26,8.78c-1.5,2.4-3.52,4.19-6.04,5.37   c-2.52,1.18-5.31,1.77-8.36,1.77s-5.83-0.59-8.33-1.77c-2.5-1.18-4.48-2.97-5.95-5.37c-1.46-2.4-2.2-5.33-2.2-8.78v-26.9H67.27z"/> <path d="M125.71,232.08l-9.76-16.96h-5.31v16.96h-6.95v-42.39h14.64c3.25,0,6.01,0.57,8.26,1.71c2.26,1.14,3.94,2.66,5.06,4.58   c1.12,1.91,1.68,4.05,1.68,6.4c0,2.77-0.8,5.28-2.41,7.53c-1.61,2.26-4.08,3.79-7.41,4.61L134,232.08H125.71z M110.64,209.57h7.69   c2.6,0,4.56-0.65,5.89-1.95c1.32-1.3,1.98-3.05,1.98-5.25c0-2.2-0.65-3.91-1.95-5.15c-1.3-1.24-3.27-1.86-5.92-1.86h-7.69V209.57z"/> <path d="M144.04,199.63c1.93-3.29,4.55-5.87,7.87-7.72c3.31-1.85,6.94-2.78,10.89-2.78c4.51,0,8.53,1.11,12.05,3.32   c3.52,2.22,6.07,5.36,7.66,9.42h-8.36c-1.1-2.24-2.62-3.9-4.58-5c-1.95-1.1-4.21-1.65-6.77-1.65c-2.81,0-5.31,0.63-7.5,1.89   c-2.2,1.26-3.91,3.07-5.15,5.43s-1.86,5.1-1.86,8.23c0,3.13,0.62,5.88,1.86,8.23c1.24,2.36,2.96,4.18,5.15,5.46   c2.2,1.28,4.7,1.92,7.5,1.92c2.56,0,4.82-0.55,6.77-1.65c1.95-1.1,3.48-2.76,4.58-5h8.36c-1.59,4.07-4.14,7.2-7.66,9.39   c-3.52,2.2-7.53,3.29-12.05,3.29c-3.99,0-7.62-0.92-10.92-2.78s-5.91-4.42-7.84-7.72c-1.93-3.29-2.9-7.02-2.9-11.16   S142.1,202.92,144.04,199.63z"/> <path d="M225.68,189.68v42.39h-6.95v-18.54h-19.95v18.54h-6.95v-42.39h6.95v18.18h19.95v-18.18H225.68z"/> <path d="M261.61,223.42h-17.75l-3.05,8.66h-7.26l15.19-42.45h8.05l15.19,42.45h-7.32L261.61,223.42z M259.66,217.74l-6.89-19.7   l-6.95,19.7H259.66z"/> <path d="M286.07,231.01c-2.28-1-4.07-2.41-5.37-4.24c-1.3-1.83-1.95-3.96-1.95-6.4h7.44c0.16,1.83,0.88,3.33,2.17,4.51   c1.28,1.18,3.08,1.77,5.4,1.77c2.4,0,4.27-0.58,5.61-1.74s2.01-2.65,2.01-4.48c0-1.42-0.42-2.58-1.25-3.48   c-0.83-0.89-1.87-1.59-3.11-2.07c-1.24-0.49-2.96-1.02-5.15-1.59c-2.77-0.73-5.01-1.47-6.74-2.23c-1.73-0.75-3.2-1.92-4.42-3.51   c-1.22-1.59-1.83-3.7-1.83-6.34c0-2.44,0.61-4.57,1.83-6.4c1.22-1.83,2.93-3.23,5.12-4.21c2.2-0.98,4.74-1.46,7.62-1.46   c4.11,0,7.47,1.03,10.1,3.08c2.62,2.05,4.08,4.87,4.36,8.45h-7.69c-0.12-1.54-0.85-2.87-2.2-3.96c-1.34-1.1-3.11-1.65-5.31-1.65   c-1.99,0-3.62,0.51-4.88,1.52c-1.26,1.02-1.89,2.48-1.89,4.39c0,1.3,0.4,2.37,1.19,3.2c0.79,0.83,1.8,1.49,3.02,1.98   s2.89,1.02,5,1.59c2.81,0.77,5.09,1.55,6.86,2.32c1.77,0.77,3.27,1.96,4.51,3.57c1.24,1.61,1.86,3.75,1.86,6.44   c0,2.16-0.58,4.19-1.74,6.1c-1.16,1.91-2.85,3.45-5.06,4.61c-2.22,1.16-4.83,1.74-7.84,1.74   C290.91,232.5,288.34,232.01,286.07,231.01z"/> <path d="M324.8,195.3v12.44h14.64v5.67H324.8v12.99h16.47v5.67h-23.42v-42.45h23.42v5.67H324.8z"/> </g> <path d="M476.26,200.86c-9.03,15.89-21.61,24.04-21.94,24.25c0.08-0.22,2.19-5.45,0.06-16.08c-2.17-10.87-11.87-12.83-11.87-12.83  s5.93-2.69,9.14-5.19c3.82-2.96,5.9-5.61,6.99-7.37c0.01-0.01,0.01-0.02,0.01-0.02c0.72-1.16,1-1.92,1.06-2.11  c0-0.01,0-0.02,0.01-0.02c0-0.01,0-0.01,0-0.02c-5.22,3.55-10.16,5.82-14.67,7.2c-10.77,3.31-19.14,1.61-23.17,0.29  c-3.7-1.21-4.71-3.1-4.59-5.17c0.04-1.14,0.44-2.34,0.9-3.5c0.4-1,0.72-1.88,0.95-2.68c0.6-2.07,0.58-3.4-0.15-4.08  c-0.55-0.51-1.39-0.83-2.01-1.32c-0.07-0.04-0.14-0.11-0.2-0.16c-0.32-0.28-0.55-0.62-0.62-1.07c-0.02-0.12-0.03-0.26-0.03-0.4  c0.01-0.04,0.01-0.08,0.01-0.12c0.07-0.91,0.55-1.35,0.99-1.57c0.39-0.19,0.78-0.2,0.83-0.2c-0.1-0.08-0.64-0.46-1.26-0.86  c-0.51-0.33-0.9-0.94-0.84-1.64c0.01-0.21,0.06-0.42,0.15-0.63c0.59-1.38,1.94-1.79,2.09-3.46c0.24-2.76-3.21-4.2-4.92-6.41  c-0.62-0.8-1.09-1.66-0.76-2.67c0.3-0.91,1.24-1.93,3.33-3.08c4.02-2.24,11.81-6.71,13.72-10.08c1.92-3.37,0.38-7.6,2.43-14.24  c2.04-6.61,5.86-8.57,8.43-8.99c0.01,0,0.01,0,0.01,0c0,0-1.22,9.6,5.92,18.27c6.11,7.42,17.75,10.04,28.23,21.39  C483.74,166.32,483.96,187.27,476.26,200.86z"/> <path d="M476.26,200.86c-9.03,15.89-21.61,24.04-21.94,24.25c0.08-0.22,2.19-5.45,0.06-16.08c-2.17-10.87-11.87-12.83-11.87-12.83  s5.93-2.69,9.14-5.19c3.82-2.96,5.9-5.61,6.99-7.37c0.01-0.01,0.01-0.02,0.01-0.02c0.72-1.16,1-1.92,1.06-2.11  c0-0.01,0-0.02,0.01-0.02c0-0.01,0-0.01,0-0.02c-5.22,3.55-10.16,5.82-14.67,7.2c3.89-7.87,3.23-23.61-2.19-32.1  c-8.17-12.78-12.31-28.97-2.53-39.95c0.01,0,0.01,0,0.01,0c0,0-1.22,9.6,5.92,18.27c6.11,7.42,17.75,10.04,28.23,21.39  C483.74,166.32,483.96,187.27,476.26,200.86z"/> <path d="M476.26,200.86c-9.15,16.11-21.95,24.26-21.95,24.26s2.25-5.22,0.07-16.09c-2.17-10.87-11.86-12.83-11.86-12.83  s5.93-2.69,9.14-5.19c3.82-2.96,5.9-5.61,6.99-7.37c-1.69,4.34-4.09,8.98-7.76,12.65c0,0,11.52,5.82,6.96,22.91  c0,0,21.07-13.16,21.65-34.91c0.66-24.67-14.13-34.74-29.87-41.76c10.23,13.09,13.93,8.23,20.49,17.93  c3.55,5.26,4.81,13.38,2.52,19.04c-4.07,10.08-11.84,13.08-11.84,13.08s8.56-15.18,3.85-26.77c-4.56-11.21-16.5-14.99-22.88-22.51  c-5.61-6.61-8.16-14.39-1.43-26.68c0,0-1.22,9.61,5.92,18.27c6.11,7.42,17.75,10.04,28.23,21.39  C483.74,166.32,483.96,187.27,476.26,200.86z"/> <path d="M413.15,155.71c-0.62-0.8-1.09-1.66-0.76-2.67c-0.01,0.9,0.78,1.31,1.64,1.6c0.86,0.28,2.96,0.48,4.32,1.26  c2.27,1.32,1.14,5.11-0.3,6.21C418.3,159.36,414.85,157.91,413.15,155.71z"/> <path d="M415.83,166.21c0.97-0.85,1.96-0.31,3.2,0.74c1.33,1.12,2.96,1.41,2.96,1.41s-3.19,0.81-4.88,0.54  c0.39-0.19,0.78-0.2,0.83-0.2c-0.1-0.08-0.63-0.46-1.26-0.86C416.15,167.52,415.76,166.91,415.83,166.21z"/> <path d="M418.97,173.54c-0.55-0.5-1.39-0.83-2.02-1.32c-0.07-0.05-0.13-0.11-0.2-0.17c-0.31-0.28-0.54-0.62-0.62-1.07  c0.01,0,0.33,0.61,1.29,0.88c1.11,0.3,2.69,0.21,3.17,1.18c0.73,1.46-0.63,3.01-1.46,4.58C419.72,175.55,419.7,174.22,418.97,173.54  z"/> <path class="st0" d="M470.71,177.28c-2.78,6.26-7.68,10.56-7.68,10.56c4.77-19.22,3.09-26.62-12.95-39.36  c-17.28-13.75-11.68-27.89-9.76-31.82c-0.21,0.66-3.25,10.69,5.13,20.57c5.73,6.75,14.42,10.42,22.71,20.39  C473.98,164.61,473.18,171.71,470.71,177.28z"/> <path d="M490.5,174.83c-2.15,4.76-4.99,7.8-4.99,7.8c2.08-11.48,2.68-23.97-10.95-34.98c-16.48-13.31-24.66-19.2-26.75-31.72  c0.13,0.55,2.63,9.47,12.67,16.05c10.04,6.58,23.91,11.56,29.71,22.2C494.45,162,492.89,169.49,490.5,174.83z"/> <path d="M490.5,174.83c-2.15,4.76-4.99,7.8-4.99,7.8c2.08-11.48,2.68-23.97-10.95-34.98c-16.48-13.31-24.66-19.2-26.75-31.72  c0.13,0.55,2.63,9.47,12.67,16.05c10.04,6.58,23.91,11.56,29.71,22.2C494.45,162,492.89,169.49,490.5,174.83z"/> <path d="M459.72,181.49c0-0.01,0-0.01,0-0.02l0.01-0.01C459.73,181.46,459.73,181.47,459.72,181.49z"/> <path d="M427.05,120.32c-0.04,0.03-0.1,0.07-0.19,0.13c-1.64,1.2-10.53,8.13-16.74,21.7c-5.21,11.39-5.47,23.25-2.49,34.54  c1.94,7.32,5.25,14.4,9.46,20.97c-4.25-3.3-7.56-6.99-10.09-10.88c-6.13-9.48-7.53-20.22-6.04-29.65  C403.1,143.74,414.29,127.68,427.05,120.32z"/> <path d="M410.12,142.15c-5.21,11.39-5.47,23.25-2.49,34.54c1.94,7.32,5.25,14.4,9.46,20.97c-4.25-3.3-7.56-6.99-10.09-10.88  c-14.21-43.39,16.76-64.19,19.85-66.34C425.23,121.65,416.33,128.58,410.12,142.15z"/> <path d="M470.71,177.28c2.23-8.73,1.59-13.75-4.88-20.01c-9.21-8.9-17.66-12.06-22.53-18.85c-7.69-10.73-3.3-21.06-2.98-21.77  c-0.21,0.66-3.25,10.69,5.13,20.57c5.73,6.75,14.42,10.42,22.71,20.39C473.98,164.61,473.18,171.71,470.71,177.28z"/> </svg>
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