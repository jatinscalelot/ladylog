const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount',
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount ready_to_shipped_date',
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
                                            updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                            updatedAt: new Date()
                                        };
                                        let cancelledOrderData = await primary.model(constants.MODELS.orders, orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                                    }else{
                                        let obj = {
                                            fullfill_status: 'cancelled',
                                            cancelledAt: new Date(),
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount refunded_amount cancelledAt updatedBy',
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount',
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount',
                sort: {createdAt: -1},
                populate: {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
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
                select: '_id orderId fullfill_status financial_status payment_type total_quantity total_price total_sgst total_cgst total_gst total_gross_amount total_discount total_discounted_amount',
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

// router.post('/downloadInvoice' , helper.authenticateToken , async (req , res) => {
//     const {orderIds} = req.body;
//     if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
//         let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//         let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
//         if(adminData && adminData != null){
//             if(orderIds && Array.isArray(orderIds) && orderIds.length > 0){
//                 let veriants = '';
//                 let invoiceSettingsData = await primary.model(constants.MODELS.invoicesettings, invoiceSettingsModel).findById(new mongoose.Types.ObjectId('658144a9d5116a3bf6162c25')).lean();
//                 if(invoiceSettingsData && invoiceSettingsData != null){
//                     async.forEachSeries(orderIds, (orderId , next_orderId) => {
//                         ( async () => {
//                             if(orderId && orderId.trim() != ''){
//                                 let orderData = await primary.model(constants.MODELS.orders, orderModel).findOne({orderId: orderId}).populate([
//                                     {path: 'veriants.veriant' , model: primary.model(constants.MODELS.veriants , veriantModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
//                                     {path: 'addressId' , model: primary.model(constants.MODELS.addresses , addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
//                                     {path: 'createdBy' , model: primary.model(constants.MODELS.users , userModel) , select: '_id name mobile'}
//                                 ]).select('-is_download -status -updatedBy -updatedAt -__v').lean();
//                                 if(orderData && orderData != null){
//                                     if(orderData.fullfill_status === 'ready_to_ship'){
//                                         async.forEachSeries(orderData.veriants, (veriant , next_veriant) => {
//                                             ( async () => {
//                                                 let productData = await primary.model(constants.MODELS.products, productModel).findById(veriant.veriant.product).select('-status -createdBy -updatedBy -createdAt -updatedAt -__v').lean();
//                                                 veriant.veriant.product = productData;
//                                                 let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(veriant.veriant.size).select('_id size_name').lean();
//                                                 veriant.veriant.size = sizeData;
//                                                 veriants += `
//                                                 <tr>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.veriant.product.title}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.veriant.SKUID}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.veriant.size.size_name}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.quantity}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.total_price}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.discount}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">${veriant.gross_amount}</td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">
//                                                     <table class="w-full table-border-0">
//                                                         <tbody>
//                                                             <tr><td class="text-[14px] font-medium p-0">GST @18.0%</td></tr>
//                                                             <tr><td class="text-[14px] font-medium p-0">Rs. ${veriant.sgst + veriant.cgst}</td></tr>
//                                                         </tbody>
//                                                     </table>
//                                                     </td>
//                                                     <td class="text-[14px] font-medium px-2.5 py-1.5">Rs. ${veriant.discounted_amount}</td>
//                                                 </tr>
//                                                 `
//                                                 next_veriant();
//                                             })().catch((error) => {
//                                                 return responseManager.onError(error , res);
//                                             });
//                                         }, () => {
//                                             const invoiceNo = helper.generateINVOId(orderData.orderId);
//                                             orderData.invoiceNo = invoiceNo;
//                                             QRcode.toDataURL(orderData.orderId , (err , code) => {
//                                                 if(code){
//                                                     orderData.QRcode = code;
//                                                     const dateObject = new Date(orderData.createdAt);
//                                                     const orderDate = dateObject.toLocaleDateString("en-GB");
//                                                     const currentdate = currentDate();
//                                                     console.log('orderData :',orderData);
//                                                     let htmlTable = `
//                                                     <table class="w-[1024px] mx-auto invoice" border="1" cellspacing="10" cellpadding="0">
//                                                         <tbody>
//                                                             <tr>
//                                                                 <td class="p-5">
//                                                                 <table class="w-full">
//                                                                     <tbody>
//                                                                     <tr>
//                                                                         <td>
//                                                                         <table class="w-full table-border">
//                                                                             <tbody>
//                                                                             <tr>
//                                                                                 <td width="30%" class="p-2.5">
//                                                                                 <span class="block text-lg font-semibold pb-1.5">Deliver To.</span>
//                                                                                 <span class="block w-44 text-sm font-medium">${orderData.createdBy.name} ${orderData.addressId.floor_no} ${orderData.addressId.building_name}, ${orderData.addressId.city}, ${orderData.addressId.state}, ${orderData.addressId.country}-${orderData.addressId.pincode}</span>
//                                                                                 <span class="block w-44 text-sm font-medium pt-1.5">${orderData.createdBy.mobile}</span>
//                                                                                 </td>
//                                                                                 <td width="70%" class="align-baseline p-0" rowspan="2">
//                                                                                 <table class="w-full table-border table-border-0">
//                                                                                     <tbody>
//                                                                                     <tr>
//                                                                                         <td class="p-0">
//                                                                                         <img src="imgpsh_fullsize_anim.png" alt="" class="block w-full object-cover">
//                                                                                         </td>
//                                                                                     </tr>
//                                                                                     <tr>
//                                                                                         <td class="p-4">
//                                                                                         <table class="w-full table-border table-border-0">
//                                                                                             <tr>
//                                                                                             <td class="test-sm font-medium py-1.5"><span class="font-semibold">Order No : </span>${orderData.orderId}</td>
//                                                                                             <td class="p-0" rowspan="5">
//                                                                                                 <div class="w-[150px] h-[150px] flex items-center justify-center ml-auto">
//                                                                                                 <img src="${orderData.QRcode}" class="w-full h-full"></img>
//                                                                                                 </div>
//                                                                                             </td>
//                                                                                             </tr>
//                                                                                             <tr>
//                                                                                             <td class="test-sm font-medium py-1.5"><span class="font-semibold">Order Date : </span>${orderDate}</td>
//                                                                                             </tr>
//                                                                                             <tr>
//                                                                                             <td class="test-sm font-medium py-1.5"><span class="font-semibold">Invoice No : </span>${orderData.invoiceNo}</td>
//                                                                                             </tr>
//                                                                                             <tr>
//                                                                                             <td class="test-sm font-medium py-1.5"><span class="font-semibold">Invoice Date : </span>${currentdate}</td>
//                                                                                             </tr>
//                                                                                             <tr>
//                                                                                             <td class="test-sm font-medium py-1.5"><span class="font-semibold">GSTIN : </span>${invoiceSettingsData.gst_no}</td>
//                                                                                             </tr>
//                                                                                         </table>
//                                                                                         </td>
//                                                                                     </tr>
//                                                                                     </tbody>
//                                                                                 </table>
//                                                                                 </td>
//                                                                             </tr>
//                                                                             <tr>
//                                                                                 <td class="p-2.5">
//                                                                                 <span class="block text-lg font-semibold pb-1.5">Deliver From.</span>
//                                                                                 <span class="block w-44 text-sm font-medium">${invoiceSettingsData.company_name} ${invoiceSettingsData.company_address} ${invoiceSettingsData.support_email}</span>
//                                                                                 <span class="block w-44 text-sm font-medium pt-1.5">${invoiceSettingsData.support_mobile_no}</span>
//                                                                                 </td>
//                                                                             </tr>
//                                                                             </tbody>
//                                                                         </table>
//                                                                         </td>
//                                                                     </tr>
//                                                                     <tr>
//                                                                         <td>
//                                                                         <table class="w-full">
//                                                                             <tbody>
//                                                                             <tr>
//                                                                                 <td width="300px"><span class="block border border-dotted border-black"></span></td>
//                                                                                 <td width="70px"><span class="block text-center text-[14px] font-semibold tracking-widest">Fold Here</span></td>
//                                                                                 <td width="300px"><span class="block border border-dotted border-black"></span></td>
//                                                                             </tr>
//                                                                             </tbody>
//                                                                         </table>
//                                                                         </td>
//                                                                     </tr>
//                                                                     <tr>
//                                                                         <td colspan="6">
//                                                                         <table class="w-full table-border">
//                                                                             <thead>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Product Name</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">SKUID</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Size</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Qty</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Total Price</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Discount</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Taxable Amount</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Taxes(CGST,SGST)</th>
//                                                                             <th class="text-[14px] tracking-wide px-2.5 py-1.5">Payable Amount</th>
//                                                                             </thead>
//                                                                             <tbody>
//                                                                                 ${veriants}
//                                                                             </tbody>
//                                                                             <tfoot>
//                                                                             <tr>
//                                                                                 <td colspan="7" class="p-0">
//                                                                                 <table class="w-full table-border table-border-0">
//                                                                                     <tbody>
//                                                                                     <tr>
//                                                                                         <td class="text-lg font-semibold px-2.5 pt-2.5">Payment info&nbsp;:&nbsp;</td>
//                                                                                         <td rowspan="2" class="text-lg font-semibold px-2.5 py-1.5 text-right">Grand Total : &nbsp;&nbsp;</td>
//                                                                                     </tr>
//                                                                                     <tr>
//                                                                                         <td class="text-[14px] text-black/90 tracking-wider px-2.5 pb-2.5">Credit Card - 236***********928</td>
//                                                                                     </tr>
//                                                                                     </tbody>
//                                                                                 </table>
//                                                                                 </td>
//                                                                                 <td colspan="1" class="text-lg font-medium px-2.5 py-1.5">Rs. 288.00</td>
//                                                                                 <td colspan="1" class="text-lg font-medium px-2.5 py-1.5">Rs. 1688.00</td>
//                                                                             </tr>
//                                                                             </tfoot>
//                                                                         </table>
//                                                                         </td>
//                                                                     </tr>
//                                                                     <tr>
//                                                                         <td class="py-5">
//                                                                         <div class="flex item-center">
//                                                                             <!-- <img src="./assets/images/logo.jpg" alt="" class="w-[150px] ml-auto"> -->
//                                                                             <img src="imgpsh_fullsize_anim.jpg" alt="" class="w-[150px] ml-auto">
//                                                                         </div>
//                                                                         </td>
//                                                                     </tr>
//                                                                     <tr>
//                                                                         <td>
//                                                                         <div class="w-full border-2 border-black p-4">
//                                                                             <span class="font-semibold">Terms & Conditions:</span>
//                                                                             <ul class="list-disc pl-5 pt-2.5">
//                                                                             <li class="text-sm tracking-widest text-black/90">All claims relating to quantity or shipping errors shall be waived by Buyer unless made in writing to Seller within thirty (30) days after delivery of goods to the address stated.</li>
//                                                                             <li class="text-sm tracking-widest text-black/90">Delivery dates are not guaranteed and Seller has no liability for damages that may be incurred due to any delay in shipment of goods hereunder. Taxes are excluded unless otherwise stated.</li>
//                                                                             </ul>
//                                                                         </div>
//                                                                         </td>
//                                                                     </tr>
//                                                                     </tbody>
//                                                                 </table>
//                                                                 </td>
//                                                             </tr>
//                                                         </tbody>
//                                                     </table>
//                                                     `
//                                                     console.log('htmlTable :',htmlTable);
//                                                     next_orderId();
//                                                 }else{
//                                                     return responseManager.onError(err , res);
//                                                 }
//                                             });
//                                         });
//                                     }else{
//                                         if(orderData.fullfill_status === 'pending'){
//                                             return responseManager.badrequest({message: 'Please first conformed order...!'}, res);
//                                         }else if(orderData.fullfill_status === 'shipped'){
//                                             return responseManager.badrequest({message: 'Order is shipped...!'}, res);
//                                         }else if(orderData.fullfill_status === 'delivered'){
//                                             return responseManager.badrequest({message: 'Order is delivered...!'}, res);
//                                         }else if(orderData.fullfill_status === 'rto'){
//                                             return responseManager.badrequest({message: 'Order in RTO...!'}, res);
//                                         }else{
//                                             return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
//                                         }
//                                     }
//                                 }else{
//                                     return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//                                 }
//                             }else{
//                                 return responseManager.badrequest({message: 'Invalid orderid to get order details...!'}, res);
//                             }
//                         })().catch((error) => {
//                             return responseManager.onError(error , res);
//                         });
//                     }, () => {
//                         return responseManager.onSuccess('Label generated successfully...!' , 1 , res);
//                     });
//                 }else{
//                     return responseManager.onError('Unable to get invoice settings data, Please try later...!', res);
//                 }
//             }else{
//                 return responseManager.badrequest({message: 'Invalid order id to get order details...!'}, res);
//             }
//         }else{
//             return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//         }
//     }else{
//         return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
//     }
// });

module.exports = router;