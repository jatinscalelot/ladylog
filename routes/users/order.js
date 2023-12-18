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
const orderModel = require('../../models/users/order.model');
const sizeMasterModel = require('../../models/admin/size.master');
const async = require('async');

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {page , limit} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            primary.model(constants.MODELS.orders, orderModel).paginate({
                createdBy: userData._id,
                status: true
            },{
                page,
                limit: parseInt(limit),
                select: '-createdBy -updatedBy -createdAt -updatedAt -__v',
                sort: {createdAt: -1},
                populate: [
                    {path: 'addressId' , model: primary.model(constants.MODELS.addresses, addressModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                    {path: 'veriants.veriant' , model: primary.model(constants.MODELS.veriants, veriantModel) , select: '-status -createdBy -updatedBy -createdAt -updatedAt -__v'},
                ],
                lean: true
            }).then((orders) => {
                async.forEachSeries(orders.docs, (order , next_order) => {
                    async.forEachSeries(order.veriants, (veriant , next_veriant) => {
                        ( async () => {
                            let productData = await primary.model(constants.MODELS.products, productModel).findById(veriant.veriant.product).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
                            let sizeData = await primary.model(constants.MODELS.sizemasters, sizeMasterModel).findById(veriant.veriant.size).select('_id size_name').lean();
                            veriant.veriant.product = productData;                            
                            veriant.veriant.size = sizeData;                            
                            next_veriant();
                        })().catch((error) => {
                            return responseManager.onError(error , res);
                        });
                    }, () => {
                        next_order();
                    });
                }, () => {
                    return responseManager.onSuccess('orders details...!', orders , res);
                });
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
                            async.forEachSeries(veriants, (veriant , next_veriant) => {
                                (async () => {
                                    if(veriant._id && veriant._id.trim() != '' && mongoose.Types.ObjectId.isValid(veriant._id)){
                                        let veriantData = await primary.model(constants.MODELS.veriants, veriantModel).findById(veriant._id).lean();
                                        if(veriantData && veriantData != null && veriantData.status === true){
                                            if(veriant.quantity && Number.isInteger(veriant.quantity) && !(isNaN(veriant.quantity)) && veriant.quantity > 0){
                                                let price = veriantData.price;
                                                let totalprice = parseInt(veriant.quantity) * price;
                                                let sgst = parseFloat(parseFloat(parseFloat(parseFloat(totalprice) * 9) / 100).toFixed(2));
                                                let cgst = parseFloat(parseFloat(parseFloat(parseFloat(totalprice) * 9) / 100).toFixed(2));
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
                                                let veriantObj = {
                                                    veriant: new mongoose.Types.ObjectId(veriantData._id),
                                                    price: parseFloat(veriantData.price),
                                                    quantity: parseInt(veriant.quantity),
                                                    total_price: parseFloat(totalprice.toFixed(2)),
                                                    sgst: parseFloat(sgst),
                                                    cgst: parseFloat(cgst),
                                                    gross_amount: parseFloat(gross_amount),
                                                    discount_per: parseFloat(veriantData.discount_per),
                                                    discount_amount: parseFloat(veriantData.discount_amount),
                                                    discount: parseFloat(discount),
                                                    discounted_amount: parseFloat(discounted_amount),
                                                    status: true
                                                };
                                                finalVeriants.push(veriantObj);
                                                next_veriant();
                                            }else{
                                                return responseManager.badrequest({message: 'Invalid quantity...!'}, res);
                                            }
                                        }else{
                                            return responseManager.badrequest({message: 'Invalid id to get product veriant...!'}, res);
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
                                    let orderObj = {
                                        orderId: orderId,
                                        veriants: finalVeriants,
                                        paymentId: paymentId.trim(),
                                        addressId: new mongoose.Types.ObjectId(addressData._id),
                                        fullfill_status: 'pending',
                                        financial_status: 'accept',
                                        createdBy: new mongoose.Types.ObjectId(userData._id)
                                    };
                                    let newOrder = await primary.model(constants.MODELS.orders, orderModel).create(orderObj);
                                    return responseManager.onSuccess('Order placed successfully...!' , 1 , res);
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

// router.post('/cancel' , helper.authenticateToken , async (req , res) => {
//     const {orderId} = req.body;
//     if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
//         let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//         let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
//         if(userData && userData != null && userData.status === true){
//             if(orderId && orderId.trim() != '' && mongoose.Types.ObjectId.isValid(orderId)){
//                 let orderData = await primary.model(constants.MODELS.orders, orderModel).findById(orderId).lean();
//                 if(orderData && orderData != null && orderData.status === true){
//                     let obj = {
//                         status: false,
//                         updatedBy: new mongoose.Types.ObjectId(userData._id),
//                         updatedAt: new Date()
//                     };
//                     let updatedOrederData = await primary.model(constants.MODELS.orders, orderModel).findByIdAndUpdate(orderData._id , obj , {returnOriginal: false}).lean();
//                     return responseManager.onSuccess('Order cancel succesfully...!', 1 , res);
//                 }else{                    
//                     return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
//                 }
//             }else{
//                 return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
//             }
//         }else{            
//             return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
//         }
//     }else{
//         return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
//     }
// });

module.exports = router;