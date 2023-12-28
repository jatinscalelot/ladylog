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
            let pastCycleData = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: userData._id}).select('_id period_start_date_timestamp period_end_date_timestamp').sort({period_start_date_timestamp: -1}).limit(13).lean();
            pastCycleData.reverse();
            let period_start_date = pastCycleData[12].period_start_date_timestamp;
            for(let i=0 ; i<12 ; i++){
                period_start_date = helper.addDaysToTimestamp(period_start_date , userData.cycle - 1);
                let period_end_date = helper.addDaysToTimestamp(period_start_date , userData.period_days - 1);
                let obj = {
                    period_start_date: new Date(period_start_date),
                    period_start_date_timestamp: period_start_date,
                    period_end_date: new Date(period_end_date),
                    period_end_date_timestamp: period_end_date
                };
                pastCycleData.push(obj);
            }
            return responseManager.onSuccess('cycles data...!' , pastCycleData , res);
        }else{
            return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get user, Please try again...!'}, res);
    }
});

router.post('/editDate' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const {period_start_date , period_end_date , cycleId} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            const currentdate_timestamp = Date.now();
            if(period_start_date && Number.isInteger(period_start_date) && isValidTimeStamp(period_start_date) && period_start_date < currentdate_timestamp){
                if(period_end_date && Number.isInteger(period_end_date) && isValidTimeStamp(period_end_date) && period_end_date > period_start_date && period_end_date < currentdate_timestamp){
                    if(cycleId && cycleId.trim() != '' && mongoose.Types.ObjectId.isValid(cycleId)){
                        let cycleData = await primary.model(constants.MODELS.mycycles, mycycleModel).findOne({_id: new mongoose.Types.ObjectId(cycleId) , createdBy: new mongoose.Types.ObjectId(userData._id)}).lean();
                        if(cycleData && cycleData != null){
                            let obj = {
                                period_start_date: new Date(period_start_date),
                                period_start_date_timestamp: period_start_date,
                                period_end_date: new Date(period_end_date),
                                period_end_date_timestamp: period_end_date,
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
                            createdBy: new mongoose.Types.ObjectId(userData._id),
                        };
                        let newCycle = await primary.model(constants.MODELS.mycycles, mycycleModel).create(obj);
                        return responseManager.onSuccess('New cycle addedd successfully...!' , 1 , res);
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