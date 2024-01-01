const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const mycycleModel = require('../../models/users/mycycle.model');
const subscribeModel = require('../../models/users/subscribe.model');
const planModel = require('../../models/admin/plan.model');

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
            let last_next_cycle_data = await primary.model(constants.MODELS.mycycles, mycycleModel).find({createdBy: userData._id}).select('_id period_start_date_timestamp period_end_date_timestamp').sort({period_start_date_timestamp: -1}).limit(2).lean();
            if(last_next_cycle_data && last_next_cycle_data.length > 0){
                if(currentTimestamp > last_next_cycle_data[0].period_end_date_timestamp){
                    let next_period_start_date = helper.addDaysToTimestamp(last_next_cycle_data[0].period_start_date_timestamp , userData.cycle - 1);
                    let next_period_end_date = helper.addDaysToTimestamp(next_period_start_date , userData.period_days - 1);
                    let nextCycleObj = {
                        period_start_date: new Date(next_period_start_date),
                        period_start_date_timestamp: next_period_start_date,
                        period_end_date: new Date(next_period_end_date),
                        period_end_date_timestamp: next_period_end_date,
                        status: true,
                        createdBy: new mongoose.Types.ObjectId(userData._id)
                    };
                    let nextCycleData = await primary.model(constants.MODELS.mycycles, mycycleModel).create(nextCycleObj);
                    last_next_cycle_data = await primary.model(constants.MODELS.mycycles, mycycleModel).find({createdBy: userData._id}).select('_id period_start_date_timestamp period_end_date_timestamp').sort({period_start_date_timestamp: -1}).limit(2).lean();
                }
                if(userData.is_subscriber === true){
                    let subscribeData = await primary.model(constants.MODELS.subscribes, subscribeModel).findById(userData.active_subscriber_plan).lean()
                    let data = {
                        period_days: parseInt(userData.period_days),
                        cycle_length: parseInt(userData.cycle),
                        plan_type: subscribeData.plan.plan_type,
                        nextCycle: {
                            period_start_date: last_next_cycle_data[0].period_start_date_timestamp,
                            period_end_date: last_next_cycle_data[0].period_end_date_timestamp
                        },
                        lastCycle: {
                            period_start_date: last_next_cycle_data[1].period_start_date_timestamp,
                            period_end_date: last_next_cycle_data[1].period_end_date_timestamp
                        }
                    };
                    return responseManager.onSuccess('Cycle data...!' , data , res);
                }else{
                    let data = {
                        period_days: parseInt(userData.period_days),
                        cycle_length: parseInt(userData.cycle),
                        plan_type: 'free',
                        nextCycle: {
                            period_start_date: last_next_cycle_data[0].period_start_date_timestamp,
                            period_end_date: last_next_cycle_data[0].period_end_date_timestamp
                        },
                        lastCycle: {
                            period_start_date: last_next_cycle_data[1].period_start_date_timestamp,
                            period_end_date: last_next_cycle_data[1].period_end_date_timestamp
                        }
                    };
                    return responseManager.onSuccess('Cycle data...!' , data , res);
                }
            }else{
                return responseManager.badrequest({message: 'No cycle data found...!'}, res);
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res); 
    }
});

module.exports = router;