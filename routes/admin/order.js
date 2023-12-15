const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const addressModel = require('../../models/users/address.model');
const productModel = require('../../models/admin/products.model');
const veriantModel = require('../../models/admin/veriants.model');
const orderModel = require('../../models/users/order.model');
const sizeMasterModel = require('../../models/admin/size.master');
const async = require('async');
const QRcode = require('qrcode');

router.get('/count' , helper.authenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            let totalOrders = await primary.model(constants.MODELS.orders, orderModel).count();
            let pendingOrders = await primary.model(constants.MODELS.orders, orderModel).count({is_pending: true , is_conform: false , is_cancelled: false , is_read_to_ship: false , is_shipped: false , is_delivered: false , is_rto: false});
            let conformedOrders = await primary.model(constants.MODELS.orders, orderModel).count({is_pending: false , is_conform: true , is_cancelled: false , is_read_to_ship: false , is_shipped: false , is_delivered: false , is_rto: false});
            let obj = {
                totalOrders: totalOrders,
                pendingOrders: pendingOrders,
                conformedOrders: conformedOrders,
            }
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
                let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                if(orderData && orderData != null){
                    return responseManager.onSuccess('Order details...!' , orderData , res);
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
    const {page , limit} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                is_pending: true
            },{
                page,
                limit: parseInt(limit),
                select: '-createdBy -updatedBy -createdAt -updatedAt -__v',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
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
                async.forEachSeries(orderIds, (orderId , next_orderId) => {
                    ( async () => {
                        if(orderId && orderId.trim() != ''){
                            let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                            if(orderData && orderData != null){
                                if(orderData.is_pending === true){
                                    let obj = {
                                        is_pending: false,
                                        is_conform: true,
                                        updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                        updatedAt: new Date()
                                    };
                                    let updatedOrderData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false}).lean();
                                    next_orderId();
                                }else{
                                    return responseManager.badrequest({message: 'Order already conformed...!'}, res);
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
                    return responseManager.onSuccess('Order Accepted successfully...!' , 1 , res);
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

router.post('/cancelOrders' ,  helper.authenticateToken , async (req , res) => {
    const {orderIds} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            async.forEachSeries(orderIds, (orderId , next_orderId) => {
                ( async () => {
                    if(orderId && orderId.trim() != ''){
                        let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
                        if(orderData && orderData != null){
                            if(orderData.is_pending === true){
                                if(orderData.is_cancelled === false){
                                    let obj = {
                                        is_pending: false,
                                        is_cancelled: true,
                                        updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                        updatedAt: new Date()
                                    };
                                    let updatedOrderData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false});
                                    next_orderId();
                                }else{
                                    return responseManager.badrequest({message: 'Order already cancelled...!'}, res);
                                }
                            }else{
                                if(orderData.is_conform === true){
                                    return responseManager.badrequest({message: 'Order is conformed, You can not cancel order now...!'}, res);
                                }else{
                                    let obj = {
                                        is_pending: false,
                                        is_conform: false,
                                        is_cancelled: true,
                                        updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                        updatedAt: new Date()
                                    };
                                    let updatedOrderData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false});
                                    next_orderId();
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
                })
            }, () => {
                return responseManager.onSuccess('Orders cancelled successfully...!' , 1 , res);
            });
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/conformedOrders' , helper.authenticateToken , async (req , res) => {
    const {page , limit} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                is_pending: false,
                is_conform: true
            }, {
                page,
                limit: parseInt(limit),
                select: '-createdBy -updatedBy -createdAt -updatedAt -__v',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                lean: true
            }).then((conformedOrders) => {
                return responseManager.onSuccess('Conformed orders...!', conformedOrders , res);
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

// router.post('/downloadInvoice' , helper.authenticateToken , async (req , res) => {
//     const {orderIds} = req.body;
//     if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
//         let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//         let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
//         if(adminData && adminData != null){
//             async.forEachSeries(orderIds, (orderId , next_orderId) => {
//                 ( async () => {
//                     if(orderId && orderId.trim() != ''){
//                         let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
//                         if(orderData && orderData != null){
//                             if(orderData.is_pending === false){
//                                 if(orderData.is_conform === true){
//                                     if(orderData.is_shipped === false){
//                                         // let data = {
//                                         //     orderId: orderData.orderId
//                                         // };
//                                         // let stringdata = JSON.stringify(data);
//                                         QRcode.toDataURL(orderData.orderId , (err , code) => {
//                                             if(code){
//                                                 console.log('code :',code);
//                                                 next_orderId();
//                                             }else{
//                                                 return responseManager.onError(err , res);
//                                             }
//                                         }); 
//                                     }else{
//                                         return responseManager.badrequest({message: 'Order is shipped...!'}, res);
//                                     }
//                                 }else{
//                                     return responseManager.badrequest({message: 'Please conform order first...!'}, res);
//                                 }
//                             }else{
//                                 return responseManager.badrequest({message: 'Please conform order first...!'}, res);
//                             }
//                         }else{
//                             return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//                         }
//                     }else{
//                         return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//                     }
//                 })().catch((error) => {
//                     return responseManager.onError(error , res);
//                 });
//             }, () => {
//                 return responseManager.onSuccess('Label generated successfully...!' , 1 , res);
//             })
//         }else{
//             return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//         }
//     }else{
//         return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//     }
// });

module.exports = router;