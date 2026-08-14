// Wraps every successful response in a consistent envelope:
// { statuscode, data, message, success }
// Keeps frontend parsing predictable — always look at res.data
class ApiResponse {
    constructor(statuscode, data, message = "success") {
        this.statuscode = statuscode
        this.data = data
        this.message = message
        this.success = statuscode < 400
    }
}

export default ApiResponse
