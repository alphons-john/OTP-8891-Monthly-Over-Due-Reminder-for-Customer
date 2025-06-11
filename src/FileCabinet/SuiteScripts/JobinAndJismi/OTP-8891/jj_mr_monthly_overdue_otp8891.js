/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
/**********************************************************************************************
* 
*
*
*
${OTP-8891}:{Monthly Over Due Reminder for Customer}
*
*
**************************************************************************************************
*
*Author:Jobin and Jismi IT Services
*
*Date Created:04-June-2025
*
*Description:This script is designed to automates monthly email notifications for customers with overdue invoices, attaching a CSV file with
*invoice details. The sender is the Sales Rep or a static NetSuite Admin if none is assigned.
*
** REVISION HISTORY
 *
* @version 1.0 04-June-2025 : Created the initial build by JJ0403
*/

define(['N/search', 'N/email', 'N/file', 'N/log'],
    /**
     * @param {search} search
     * @param {email} email
     * @param {file} file
     * @param {log} log
     */
    (search, email, file, log) => {

        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @returns {Search} The input data to use in the map/reduce process
         */
        const getInputData = (inputContext) => fetchInvoiceData();

        /**
         * Defines the function that is executed when the map entry point is triggered.
         * @param {Object} mapContext - Data collection containing key-value pairs to process in the map stage.
         */
        const map = (mapContext) => {
            const invoiceDetails = extractInvoiceDetails(mapContext.value);
            mapContext.write({
                key: invoiceDetails.customerId,
                value: invoiceDetails
            });
        };

        /**
         * Defines the function executed during the reduce stage after mapping.
         * @param {Object} reduceContext - Collection containing grouped key-value pairs for processing.
         */
        const reduce = (reduceContext) => {
            const customerId = reduceContext.key;
            const invoiceDataList = reduceContext.values.map(JSON.parse);
            const csvFileData = generateCSVFile(invoiceDataList);
            sendInvoiceEmail(customerId, csvFileData);
        };

        /**
         * Fetches overdue invoice data using a search query.
         * @returns {Search} The overdue invoice search result.
         */
        const fetchInvoiceData = () => {
            try {
                return search.create({
                    title: 'Overdue Invoice JJ',
                    id: 'customsearch_jj_overdue_invoice',
                    type: "invoice",
                    filters: [
                        ["type", "anyof", "CustInvc"],
                        "AND",
                        ["daysoverdue", "greaterthan", "0"],
                        "AND",
                        ["mainline", "is", "T"],
                        "AND",
                        ["trandate", "onorbefore", "lastmonth"]
                    ],
                    columns: [
                        search.createColumn({ name: "entity", label: "Name" }),
                        search.createColumn({ name: "email", label: "Email" }),
                        search.createColumn({ name: "tranid", label: "Document Number" }),
                        search.createColumn({ name: "amount", label: "Amount" }),
                        search.createColumn({ name: "daysoverdue", label: "Days Overdue" }),
                        search.createColumn({
                            name: "salesrep",
                            join: "customerMain",
                            label: "Sales Rep"
                        })
                    ]
                });
            } catch (error) {
                log.error('Error fetching invoice data', error.message);
            }
        };

        /**
         * Extracts relevant details from invoice data.
         * @param {string} contextValue - JSON string containing the invoice data.
         * @returns {Object} The parsed invoice details.
         */
        const extractInvoiceDetails = (contextValue) => {
            try {
                const mapContextData = JSON.parse(contextValue);
                return {
                    customerName: mapContextData.values.entity.text,
                    customerId: mapContextData.values.entity.value,
                    customerEmail: mapContextData.values.email,
                    documentNo: mapContextData.values.tranid,
                    invoiceAmount: mapContextData.values.amount,
                    daysOverdue: mapContextData.values.daysoverdue,
                    salesRep: mapContextData.values['salesrep.customerMain'].value
                };
            } catch (error) {
                log.error('Error extracting invoice details', error.message);
            }
        };

        /**
         * Generates a CSV file from overdue invoice details.
         * @param {Array} invoiceDataList - List of invoice data objects.
         * @returns {Object} The generated CSV file and metadata.
         */
        const generateCSVFile = (invoiceDataList) => {
            let csvContent = "";
            let csvName = "";
            let rep = "";
            let customer = "";

            invoiceDataList.forEach(data => {
                csvContent += `Customer name: ${data.customerName}, Email: ${data.customerEmail}, Document number: ${data.documentNo},
                 Amount: ${data.invoiceAmount}, Days Overdue: ${data.daysOverdue} \n`;
                csvName = `Days Overdue ${data.customerName}.csv`;
                rep = data.salesRep;
                customer = data.customerName;
            });

            try {
                const csvFile = file.create({
                    name: csvName,
                    fileType: file.Type.CSV,
                    contents: csvContent,
                    description: "This file contains the details of overdue invoice information till the previous month.",
                    encoding: file.Encoding.UTF8,
                    folder: -14,
                    isOnline: true,
                });

                return { fileId: csvFile.save(), csvFile, rep, customer };
            } catch (error) {
                log.error('Error generating CSV file', error.message);
            }
        };

        /**
         * Sends an email with the overdue invoice CSV attachment.
         * @param {string} recipientId - The customer ID.
         * @param {Object} csvFileData - The generated CSV file data.
         */
        const sendInvoiceEmail = (recipientId, csvFileData) => {
            try {
                email.send({
                author: csvFileData.rep > 0 ? csvFileData.rep : -5,
                recipients: recipientId,
                subject: 'Overdue Invoices Notification',
                body: 'Dear Customer,\n\n' +
                    'We hope you are doing well. Please find attached the details of your overdue invoices till the previous month.\n\n' +
                    'If you have any questions or need assistance, feel free to reach out.\n\n' +
                    'Best regards,\n' +
                    `${csvFileData.rep > 0 ? 'your Sales Rep' : 'NetSuite Admin' }`,
                    
                attachments: [csvFileData.csvFile]
                });

            } catch (error) {
                log.error('Error sending invoice email', error.message);
            }
        };

        return { getInputData, map, reduce };
    });
