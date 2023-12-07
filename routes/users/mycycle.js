const express = require('express');
const router = express.Router();

const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const mongoose = require('mongoose');

// function getTimestampsBetweenDates(startTimestamp, endTimestamp) {
//     const timestamps = [];
//     const startDate = new Date(startTimestamp);
//     startDate.setHours(0, 0, 0, 0);
//     const endDate = new Date(endTimestamp);
//     endDate.setHours(23, 59, 59, 999);
//     for (let currentDate = startDate; currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
//         timestamps.push(currentDate.getTime());
//     }
//     return timestamps;
// }

router.get('/' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            const currentTimestamp = Date.now();
            if(currentTimestamp > userData.period_end_date){
                let obj = {
                    period_start_date: userData.period_start_date,
                    period_end_date: userData.period_end_date,
                    period_days: userData.period_days,
                    createdBy: new mongoose.Types.ObjectId(userData._id)
                }
                await primary.model(constants.MODELS.mycycles , mycycleModel).create(obj);
                const next_period_start_date = helper.addDaysToTimestamp(userData.period_start_date , userData.cycle-1);
                const next_period_end_date = helper.addDaysToTimestamp(next_period_start_date , userData.period_days-1);
                let updateUser = await primary.model(constants.MODELS.users , userModel).findById(userData._id , {period_start_date: next_period_start_date , period_end_date: next_period_end_date} , {returnOriginal: false}).lean();
                let lastCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: userData._id}).sort({period_start_date: -1}).limit(1).lean();
                let data = {
                    period_days: updateUser.period_days,
                    lastCycle: {
                        period_start_date: lastCycle.period_start_date,
                        period_end_date: lastCycle.period_end_date
                    },
                    nextCycle: {
                        period_start_date: updateUser.period_start_date,
                        period_end_date: updateUser.period_end_date
                    }
                }
                return responseManager.onSuccess('Cycle data...!' , data , res);
            }else{
                let lastCycle = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: userData._id}).sort({period_start_date: -1}).limit(1).lean();
                let data = {
                    period_days: userData.period_days,
                    lastCycle: {
                        period_start_date: lastCycle[0].period_start_date,
                        period_end_date: lastCycle[0].period_end_date
                    },
                    nextCycle: {
                        period_start_date: userData.period_start_date,
                        period_end_date: userData.period_end_date
                    }
                }
                return responseManager.onSuccess('Cycle data...!' , data , res);
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res); 
    }
});

router.post('/editDate' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            const {period_start_date , period_end_date} = req.body;
            if(period_start_date && period_end_date){
                let updateUserData = await primary.model(constants.MODELS.users , userModel).findByIdAndUpdate(userData._id , {period_start_date: period_start_date , period_end_date: period_end_date});
                return responseManager.onSuccess('Date update successfully...!' , null , res);
            }else{
                return responseManager.badrequest({ message: 'Invalid data to update date, please try again' }, res)
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res); 
    }
});

module.exports = router;