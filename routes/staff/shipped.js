const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const staffModel = require('../../models/admin/staff.model');
const orderModel = require('../../models/users/order.model');

router.post('/' , helper.staffAuthenticateToken , async (req , res) => {
    const {orderId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let staffMemberData = await primary.model(constants.MODELS.staffies , staffModel).findById(req.token._id).lean();
        if(staffMemberData && staffMemberData != null && staffMemberData.status === true){
            if(req.Token === staffMemberData.token){
                if(orderId && orderId.trim() != ''){
                    let orderData = await primary.model(constants.MODELS.orders , orderModel).findOne({orderId: orderId}).lean();
                    if(orderData && orderData != null){
                        if(orderData.fullfill_status === 'ready_to_ship'){
                            let obj = {
                                fullfill_status: 'shipped',
                                shippedAt: new Date(),
                                shipped_timestamp: Date.now(),
                                shipped_by: new mongoose.Types.ObjectId(staffMemberData._id),
                                updatedBy: new mongoose.Types.ObjectId(staffMemberData._id),
                                updatedAt: new Date()
                            };
                            let updatedOrdersData = await primary.model(constants.MODELS.orders , orderModel).findOneAndUpdate({orderId: orderData.orderId} , obj , {returnOriginal: false}).lean();
                            return responseManager.onSuccess('Order shipped successfully...!' , 1 , res);
                        }else{
                            if(orderData.fullfill_status === 'pending'){
                                return responseManager.badrequest({message: 'Order in pending, Please conform order first...!'}, res);
                            }else if(orderData.fullfill_status === 'shipped'){
                                return responseManager.badrequest({message: 'Orders is already shipped...!'}, res);
                            }else if(orderData.fullfill_status === 'delivered'){
                                return responseManager.badrequest({message: 'Order is delivered...!'}, res);
                            }else if(orderData.fullfill_status === 'rto'){
                                return responseManager.badrequest({message: 'Order in rto...!'}, res);
                            }else{
                                return responseManager.badrequest({message: 'Order is cancelled...!'}, res);
                            }
                        }
                    }else{
                        return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid id to get order details...!'}, res);
                }
            }else{
                return responseManager.unauthorisedRequest(res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get staff member, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get staff member, Please try again...!'}, res);
    }
});

module.exports = router;