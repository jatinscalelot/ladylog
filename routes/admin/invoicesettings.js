const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const mongoConnection = require('../../utilities/connections');
const responseManager = require('../../utilities/response.manager');
const constants = require('../../utilities/constants');
const helper = require('../../utilities/helper');
const adminModel = require('../../models/admin/admin.model');
const invoiceSettingsModel = require('../../models/admin/invoice.settings');

function isValidPhoneNumber(phonenumber) {
    let regex = new RegExp(/^[+]{1}(?:[0-9\-\(\)\/\.]\s?){6, 15}[0-9]{1}$/);
    if (phonenumber == null) {
        return false;
    }
    if (regex.test(phonenumber) == true) {
        return true;
    }
    else {
        return false;
    }
}

router.get('/' , helper.authenticateToken , async (req , res) => {
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            let invoiceSettingsData = await primary.model(constants.MODELS.invoicesettings , invoiceSettingsModel).findOne().select('-createdBy -updatedBy -createdAt -updatedAt -__v ').lean();
            return responseManager.onSuccess('Invoice settings data...!' , invoiceSettingsData , res);
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

router.post('/' , helper.authenticateToken , async (req , res) => {
    const {invoiceSettingsId , company_name , company_email , bank_name , bank_ifsc , bank_account_no , pan_card , gst_no , support_mobile_no , support_email , tc} = req.body;
    if(req.token._id && mongoose.Types.ObjectId.isValid(req.token._id)){
        let primary = mongoConnection.useDb(constants.DEFAULT_DB);
        let adminData = await primary.model(constants.MODELS.admins, adminModel).findById(req.token._id).lean();
        if(adminData && adminData != null){
            if(invoiceSettingsId && invoiceSettingsId.trim() != '' && mongoose.Types.ObjectId.isValid(invoiceSettingsId)){
                let invoiceSettingsData = await primary.model(constants.MODELS.invoicesettings , invoiceSettingsModel).findById(invoiceSettingsId).lean();
                if(invoiceSettingsData && invoiceSettingsData != null){
                    if(company_name && company_name.trim() != ''){
                        if(company_email && company_email.trim() != '' && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(company_email)){
                            if(bank_name && bank_name.trim() != ''){
                                if(bank_ifsc && bank_ifsc.trim() != ''){
                                    if(bank_account_no && Number.isInteger(bank_account_no)){
                                        if(pan_card && pan_card.trim() != ''){
                                            if(gst_no && gst_no.trim() != ''){
                                                if(support_mobile_no && support_mobile_no.trim() != ''){
                                                    if(support_email && support_email.trim() != '' && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(support_email)){
                                                        if(tc && tc.trim() != '' && tc.length < 8000){
                                                            let obj = {
                                                                company_name: company_name.trim(),
                                                                company_email: company_email,
                                                                bank_name: bank_name.trim(),
                                                                bank_ifsc: bank_ifsc.trim(),
                                                                bank_account_no: bank_account_no,
                                                                pan_card: pan_card.trim(),
                                                                gst_no: gst_no.trim(),
                                                                support_mobile_no: support_mobile_no.trim(),
                                                                support_email: support_email,
                                                                tc: tc.trim(),
                                                                updatedBy: new mongoose.Types.ObjectId(adminData._id),
                                                                updatedAt: new Date()
                                                            };
                                                            let updatedInvoiceSettingsData = await primary.model(constants.MODELS.invoicesettings , invoiceSettingsModel).findByIdAndUpdate(invoiceSettingsData._id , obj , {returnOriginal: false}).lean();
                                                            return responseManager.onSuccess('Invoice settings data updated successfully...!' , 1 , res);
                                                        }else{
                                                            return responseManager.badrequest({message: 'Please provide terms & conditions(< 8000)...!'}, res);
                                                        }
                                                    }else{
                                                        return responseManager.badrequest({message: 'Please enter valid support email...!'}, res);
                                                    }
                                                }else{
                                                    return responseManager.badrequest({message: 'Please enter valid support mobile number...!'}, res);
                                                }
                                            }else{
                                                return responseManager.badrequest({message: 'Please enter valid company GSTIN number...!'}, res);
                                            }
                                        }else{
                                            return responseManager.badrequest({message: 'Please enter valid pancard number...!'}, res);
                                        }
                                    }else{
                                        return responseManager.badrequest({message: 'Please enter a valid bank account number...!'}, res);
                                    }
                                }else{
                                    return responseManager.badrequest({message: 'Please enter a bank IFSC code...!'}, res);
                                }
                            }else{
                                return responseManager.badrequest({message: 'Please enter a bank name...!'}, res);
                            }
                        }else{
                            return responseManager.badrequest({message: 'Please enter a company email...!'}, res);
                        }
                    }else{
                        return responseManager.badrequest({message: 'Please enter a company name...!'}, res);
                    }
                }else{
                    return responseManager.badrequest({message: 'Invalid invoice setting id to update invoice settings data...!'}, res);
                }
            }else{
                return responseManager.badrequest({message: 'Invalid invoice setting id to update invoice settings data...!'}, res);
            }
        }else{
            return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
        }
    }else{
        return responseManager.badrequest({message: 'Invalid token to get admin, Please try again...!'}, res);
    }
});

module.exports = router;