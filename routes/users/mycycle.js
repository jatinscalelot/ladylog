const express = require('express');
const router = express.Router();
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const userModel = require('../../models/users/users.model');
const symptomModel = require('../../models/admin/symptoms.model');
const userSymptomsModel = require('../../models/users/userSymptoms.model');
const mycycleModel = require('../../models/users/mycycle.model');
const mongoose = require('mongoose');
const async = require('async');

function isDateBetween(startTimestamp, endTimestamp, dateTimestamp) {
    const startDateObj = new Date(startTimestamp);
    const endDateObj = new Date(endTimestamp);
    const dateToCheckObj = new Date(dateTimestamp);
    return startDateObj <= dateToCheckObj && dateToCheckObj <= endDateObj;
};

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
                const next_period_start_date = helper.addDaysToTimestamp(userData.period_end_date , userData.cycle+1);
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
                if(lastCycle != null){
                    let data = {
                        period_days: userData.period_days,
                        lastCycle: {
                            period_start_date: lastCycle.period_start_date,
                            period_end_date: lastCycle.period_end_date
                        },
                        nextCycle: {
                            period_start_date: userData.period_start_date,
                            period_end_date: userData.period_end_date
                        }
                    }
                    return responseManager.onSuccess('Cycle data...!' , data , res);
                }else{
                    return responseManager.onError('Past cycle not found...!' , 1 , res);
                }
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

router.post('/addSymptoms' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            const {date , birth_control , pain , bleeding_flow , mood , avg_sleep , sexual_experience} = req.body;
            if(isDateBetween(userData.period_start_date , userData.period_end_date , date)){
                let obj = {
                    date: date,
                    birth_controls: birth_control,
                    pains: pain,
                    bleeding_flows: bleeding_flow,
                    moods: mood,
                    avg_sleeps: avg_sleep,
                    sexual_experiences: sexual_experience,
                    createdBy: userData._id
                }
                await primary.model(constants.MODELS.usersymptoms , userSymptomsModel).create(obj);
                return responseManager.onSuccess('Symptoms add successfully...!' , 1 , res);
            }else{
                return responseManager.badrequest({ message: 'Invalid date, please try again' }, res);
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
    }
});

router.get('/getUserSymptoms' , helper.authenticateToken , async (req , res) => {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let userData = await primary.model(constants.MODELS.users, userModel).findById(req.token._id).lean();
        if(userData && userData != null){
            let symptoms = await primary.model(constants.MODELS.usersymptoms , userSymptomsModel).find({createdBy:userData._id , date: {$gte: userData.period_start_date , $lte: userData.period_end_date}}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
            if(symptoms && symptoms.length > 0){
                let details_of_symptoms = [];
                async.forEachSeries(symptoms, (symptom, next_symptom) => {
                    let obj = {};
                    obj._id = symptom._id;
                    obj.date = symptom.date;
                    obj.birth_controls = [];
                    obj.pains = [];
                    obj.bleeding_flows = [];
                    obj.moods = [];
                    obj.avg_sleeps = [];
                    obj.sexual_experiences = [];
                    async.forEachSeries(symptom.birth_controls , (birth_control, next_birth_control) => {
                        ( async () => {
                            let data = await primary.model(constants.MODELS.symptoms, symptomModel).findById(birth_control).select('_id symptom_type name svg').lean();
                            obj.birth_controls.push(data);
                            next_birth_control();
                        })().catch((error) => { });
                    }, () => {
                        async.forEachSeries(symptom.pains , (pain, next_pain) => {
                            ( async () => {
                                let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(pain).select('_id symptom_type name svg').lean();
                                obj.pains.push(data);
                                next_pain();
                            })().catch((error) => { });
                        } , () => {
                            async.forEachSeries(symptom.bleeding_flows , (bleeding_flow, next_bleeding_flow) => {
                                ( async () => {
                                    let data = await primary.model(constants.MODELS.symptoms, symptomModel).findById(bleeding_flow).select('_id symptom_type name svg').lean();
                                    obj.bleeding_flows.push(data);
                                    next_bleeding_flow();
                                })().catch((error) => { });
                            } , () => {
                                async.forEachSeries(symptom.moods , (mood , next_mood) => {
                                    ( async () => {
                                        let data = await primary.model(constants.MODELS.symptoms, symptomModel).findById(mood).select('_id symptom_type name svg').lean();
                                        obj.moods.push(data);
                                        next_mood();
                                    })().catch((error) => { });
                                } , () => {
                                    async.forEachSeries(symptom.avg_sleeps , (avg_sleep , next_avg_sleep) => {
                                        ( async () => {
                                            let data = await primary.model(constants.MODELS.symptoms, symptomModel).findById(avg_sleep).select('_id symptom_type name svg').lean();
                                            obj.avg_sleeps.push(data);
                                            next_avg_sleep();
                                        })().catch((error) => { });
                                    } , () => {
                                        async.forEachSeries(symptom.sexual_experiences , (sexual_experience , next_sexual_experience) => {
                                            ( async () => {
                                                let data = await primary.model(constants.MODELS.symptoms, symptomModel).findById(sexual_experience).select('_id symptom_type name svg').lean();
                                                obj.sexual_experiences.push(data);
                                                next_sexual_experience();
                                            })().catch((error) => { });
                                        } , () => {
                                            details_of_symptoms.push(obj);
                                            next_symptom();
                                        });
                                    });
                                });
                            });
                        });
                    });
                }, () => {
                    let data = {
                        message: 'Current cycle symptoms',
                        symptoms: details_of_symptoms
                    }
                    return responseManager.onSuccess('My cycle' , data , res);
                }); 
            }else{
                let data = {
                    message: 'No symptoms added...!',
                    symptoms: []
                }
                return responseManager.onSuccess('My cycle' , data , res);
            }
        }else{
            return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
        }
    }else{
        return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
    }
});

module.exports = router;