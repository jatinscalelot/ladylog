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

// router.post('/getone' , helper.authenticateToken , async (req , res) => {
//     const {orderId} = req.body;
//     if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
//         let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//         let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
//         if(adminData && adminData != null){
//             if(orderId && orderId.trim() != ''){
//                 let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).lean();
//                 if(orderData && orderData != null){
//                     return responseManager.onSuccess('Order details...!' , orderData , res);
//                 }else{
//                     return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//                 }
//             }else{
//                 return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//             }
//         }else{            
//             return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//         }
//     }else{
//         return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//     }
// });


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
                select: '-createdBy -updatedBy -__v',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                lean: true
            }).then((pendingOrders) => {
                async.forEachSeries(pendingOrders.docs, (pendingOrder , next_pendingOrder) => {
                    ( async () => {
                        let totalObject = await primary.model(constants.MODELS.orders, orderModel).aggregate([
                            {$match: {_id: pendingOrder._id}},
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
                            pendingOrder.totalQuantity = parseInt(totalObject[0].totalQuantity);
                            pendingOrder.totalNetPrice = parseFloat(parseFloat(totalObject[0].totalNetPrice).toFixed(2));
                            pendingOrder.totalTax = parseFloat(parseFloat(totalObject[0].totalSGST + totalObject[0].totalCGST).toFixed(2));
                            pendingOrder.totalGrossAmount = parseFloat(parseFloat(totalObject[0].totalGrossAmount).toFixed(2));
                            pendingOrder.totalDiscount = parseFloat(parseFloat(totalObject[0].totalDiscount).toFixed(2));
                            pendingOrder.totalDiscountendPrice = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                            pendingOrder.totalPay = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                        }else{
                            pendingOrder.totalQuantity = 0;
                            pendingOrder.totalNetPrice = 0;
                            pendingOrder.totalTax = 0;
                            pendingOrder.totalGrossAmount = 0;
                            pendingOrder.totalDiscount = 0;
                            pendingOrder.totalDiscountendPrice = 0;
                            pendingOrder.totalPay = 0;
                        }
                        next_pendingOrder();
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('Pending orders...!' , pendingOrders , res);
                });
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
                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                            updatedAt: new Date()
                        };
                        let updatedOrdersData = await primary.model(constants.MODELS.orders, orderModel).updateMany({orderId: {$in: orderIdsToUpdate}} , obj , {returnOriginal: false}).lean();
                        console.log('updatedOrdersData :',updatedOrdersData);
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
                select: '-createdBy -updatedBy -__v',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                lean: true
            }).then((readyToShipOrders) => {
                async.forEachSeries(readyToShipOrders.docs, (readyToShipOrder , next_readyToShipOrder) => {
                    ( async () => {
                        let totalObject = await primary.model(constants.MODELS.orders, orderModel).aggregate([
                            {$match: {_id: readyToShipOrder._id}},
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
                            readyToShipOrder.totalQuantity = parseInt(totalObject[0].totalQuantity);
                            readyToShipOrder.totalNetPrice = parseFloat(parseFloat(totalObject[0].totalNetPrice).toFixed(2));
                            readyToShipOrder.totalTax = parseFloat(parseFloat(totalObject[0].totalSGST + totalObject[0].totalCGST).toFixed(2));
                            readyToShipOrder.totalGrossAmount = parseFloat(parseFloat(totalObject[0].totalGrossAmount).toFixed(2));
                            readyToShipOrder.totalDiscount = parseFloat(parseFloat(totalObject[0].totalDiscount).toFixed(2));
                            readyToShipOrder.totalDiscountendPrice = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                            readyToShipOrder.totalPay = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                        }else{
                            readyToShipOrder.totalQuantity = 0;
                            readyToShipOrder.totalNetPrice = 0;
                            readyToShipOrder.totalTax = 0;
                            readyToShipOrder.totalGrossAmount = 0;
                            readyToShipOrder.totalDiscount = 0;
                            readyToShipOrder.totalDiscountendPrice = 0;
                            readyToShipOrder.totalPay = 0;
                        }
                        next_readyToShipOrder();
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('Pending orders...!' , readyToShipOrders , res);
                });
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
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let cancelledOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }else{
                                        let obj = {
                                            fullfill_status: 'cancelled',
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
                select: '-createdBy -updatedBy -__v',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                lean: true
            }).then((cancelledOrders) => {
                async.forEachSeries(cancelledOrders.docs, (cancelledOrder , next_cancelledOrder) => {
                    ( async () => {
                        let totalObject = await primary.model(constants.MODELS.orders, orderModel).aggregate([
                            {$match: {_id: cancelledOrder._id}},
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
                            cancelledOrder.totalQuantity = parseInt(totalObject[0].totalQuantity);
                            cancelledOrder.totalNetPrice = parseFloat(parseFloat(totalObject[0].totalNetPrice).toFixed(2));
                            cancelledOrder.totalTax = parseFloat(parseFloat(totalObject[0].totalSGST + totalObject[0].totalCGST).toFixed(2));
                            cancelledOrder.totalGrossAmount = parseFloat(parseFloat(totalObject[0].totalGrossAmount).toFixed(2));
                            cancelledOrder.totalDiscount = parseFloat(parseFloat(totalObject[0].totalDiscount).toFixed(2));
                            cancelledOrder.totalDiscountendPrice = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                            cancelledOrder.totalPay = parseFloat(parseFloat(totalObject[0].totalDiscountendPrice).toFixed(2));
                        }else{
                            cancelledOrder.totalQuantity = 0;
                            cancelledOrder.totalNetPrice = 0;
                            cancelledOrder.totalTax = 0;
                            cancelledOrder.totalGrossAmount = 0;
                            cancelledOrder.totalDiscount = 0;
                            cancelledOrder.totalDiscountendPrice = 0;
                            cancelledOrder.totalPay = 0;
                        }
                        next_cancelledOrder();
                    })().catch((error) => {
                        return responseManager.onError(error , res);
                    });
                }, () => {
                    return responseManager.onSuccess('Pending orders...!' , cancelledOrders , res);
                });
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