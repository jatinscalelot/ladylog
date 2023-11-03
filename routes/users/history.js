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

router.get('/' , helper.authenticateToken ,async (req , res) => {
  if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
    let primary = mongoConnection.useDb(constants.DEFAULT_DB);
    let userData = await primary.model(constants.MODELS.users , userModel).findById(req.token._id).lean();
    if(userData && userData != null){
      const {page , limit} = req.body;
      let allCycleData = await primary.model(constants.MODELS.mycycles , mycycleModel).find({createdBy: userData._id}).select('_id period_start_date period_end_date period_days').limit(limit).skip(limit * page).sort({period_start_date: -1}).lean();
      if(allCycleData){
        async.forEachSeries(allCycleData , (cycle , next_cycle) => {
          (async () => {
            let symptoms = await primary.model(constants.MODELS.usersymptoms , userSymptomsModel).find({createdBy:userData._id , date: {$gte: cycle.period_start_date , $lte: cycle.period_end_date}}).select('-createdBy -updatedBy -createdAt -updatedAt -__v').lean();
            if(symptoms && symptoms.length > 0){
              let symptom = symptoms[0];
              cycle.birth_controls = [];
              cycle.pains = [];
              cycle.bleeding_flows = [];
              cycle.moods = [];
              cycle.avg_sleeps = [];
              cycle.sexual_experiences = [];
              async.forEachSeries(symptom.birth_controls, (birth_control , next_birth_control) => {
                (async () => {
                  let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(birth_control).select('_id symptom_type name svg').lean();
                  cycle.birth_controls.push(data);
                  next_birth_control();
                })().catch((error) => { });
              }, () => {
                async.forEachSeries(symptom.pains, (pain , next_pain) => {
                  (async () => {
                    let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(pain).select('_id symptom_type name svg').lean();
                    cycle.pains.push(data);
                    next_pain();
                  })().catch((error) => { });
                }, () => {
                  async.forEachSeries(symptom.bleeding_flows, (bleeding_flow , next_bleeding_flow) => {
                    (async () => {
                      let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(bleeding_flow).select('_id symptom_type name svg').lean();
                      cycle.bleeding_flows.push(data);
                      next_bleeding_flow();
                    })().catch((error) => { });
                  } , () => {
                    async.forEachSeries(symptom.moods, (mood , next_mood) => {
                      (async () => {
                        let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(mood).select('_id symptom_type name svg').lean();
                        cycle.moods.push(data);
                        next_mood();
                      })().catch((error) => { });
                    }, () => {
                      async.forEachSeries(symptom.avg_sleeps, (avg_sleep, next_avg_sleep) => {
                        (async () => {
                          let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(avg_sleep).select('_id symptom_type name svg').lean();
                          cycle.avg_sleeps.push(data);
                          next_avg_sleep();
                        })().catch((error) => { });
                      }, () => {
                        async.forEachSeries(symptom.sexual_experiences, (sexual_experience , next_sexual_experience) => {
                          (async () => {
                            let data = await primary.model(constants.MODELS.symptoms , symptomModel).findById(sexual_experience).select('_id symptom_type name svg').lean();
                            cycle.sexual_experiences.push(data);
                            next_sexual_experience();
                          })().catch((error) => { });
                        }, () => {
                          next_cycle();
                        })
                      })
                    })
                  });
                });
              });
            }else{
              cycle.symptoms = {};
              next_cycle();
            }
          })().catch((error) => { });
        } , () => {
          return responseManager.onSuccess('All cycle data...!',allCycleData , res);
        });
      }else{
        return responseManager.badrequest({message: 'No data found...!'}, res);
      }
    }else{
      return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
    }
  }else{
    return responseManager.badrequest({ message: 'Invalid token to get user, please try again' }, res);
  }
});

module.exports = router;