const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');

function isValidTimeStamp(timestamp){
    let valid = ((new Date(timestamp)).getTime()) > 0;
    return valid;
  }

router.get('/' , helper.authenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
        if(userData && userData != null && userData.status === true){
            let pastCyclesData = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: userData._id , status: true}).select('_id period_start_date_timestamp period_end_date_timestamp status').sort({period_start_date_timestamp: -1}).limit(13).lean();
            pastCyclesData.reverse();
            let data = {
                pastCyclesData: pastCyclesData,
                period_days: parseInt(userData.period_days),
                cycle_length: parseInt(userData.cycle)
            };
            return responseManager.onSuccess('cycles data...!' , data , res);
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/editdate' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const {period_start_date , period_end_date , cycleId , status} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            if(period_start_date && Number.isInteger(period_start_date) && isValidTimeStamp(period_start_date)){
                if(period_end_date && Number.isInteger(period_end_date) && isValidTimeStamp(period_end_date) && period_end_date > period_start_date){
                    if(status === true || status === false){
                        if(cycleId && cycleId.trim() != '' && mongoose.Types.ObjectId.isValid(cycleId)){
                            let cycleData = await primary.model(constants.MODELS.mycycles, mycycleModel).findOne({_id: new mongoose.Types.ObjectId(cycleId) , createdBy: new mongoose.Types.ObjectId(userData._id)}).lean();
                            if(cycleData && cycleData != null){
                                let obj = {
                                    period_start_date: new Date(period_start_date),
                                    period_start_date_timestamp: period_start_date,
                                    period_end_date: new Date(period_end_date),
                                    period_end_date_timestamp: period_end_date,
                                    status: status,
                                    updatedBy: new mongoose.Types.ObjectId(userData._id),
                                    updatedAt: new Date()
                                };
                                let updatedCycleData = await primary.model(constants.MODELS.mycycles, mycycleModel).findByIdAndUpdate(cycleData._id , obj , {returnOriginal: false}).lean();
                                return responseManager.onSuccess('cycle data updated successfully...!' , 1 , res);
                            }else{
                                return responseManager.badrequest({message: 'Invalid id to get cycle data...!'}, res);
                            }
                        }else{
                            let obj = {
                                period_start_date: new Date(period_start_date),
                                period_start_date_timestamp: period_start_date,
                                period_end_date: new Date(period_end_date),
                                period_end_date_timestamp: period_end_date,
                                status: status,
                                createdBy: new mongoose.Types.ObjectId(userData._id),
                            };
                            let newCycle = await primary.model(constants.MODELS.mycycles, mycycleModel).create(obj);
                            return responseManager.onSuccess('New cycle addedd successfully...!' , 1 , res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Invalid status...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({ message: 'Invalid end date, please try again' }, res)
                }
            }else{
                return responseManager.badrequest({ message: 'Invalid start date, please try again' }, res);
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res); 
    }
});

module.exports = router;