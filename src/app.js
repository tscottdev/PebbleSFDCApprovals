/**
 * (c) Tony Scott. Licensed under a Creative Commons Attribution 3.0 Unported License.
 * http://creativecommons.org/licenses/by/3.0/deed.en_US
 *
 * This software is provided as is, at your own risk and without warranty of any kind.
 *
 * Please visit my blog: http://meltedwires.com/ and 'like' if you've found this useful. 
 */

// Required Libraries
var UI = require('ui');
var ajax = require('ajax');
var Vector2 = require('vector2');
var Settings = require('settings');
var AppSettings = require('app-settings');

// Salesforce Token (returned by the login function)
var token = '';

// Main Card
var main = new UI.Card({
    title: 'SFDC',
    subtitle: 'Approvals',
    icon: 'images/checkbox28x28.png',
    body: 'Connecting ...',
    action: { select: 'images/reload16x16.png' }
});

// Add Event listners for Configuration Screen to get and store the User and Password
Pebble.addEventListener('showConfiguration', function(e) {
    // Show config page
    console.log('AppSettings.configURL=' + AppSettings.configURL);
    Pebble.openURL(AppSettings.configURL);
});

Pebble.addEventListener('webviewclosed', function(e) {
    console.log('Configuration window returned: ' + e.response);

    var configuration = JSON.parse(decodeURIComponent(e.response));
    
    Settings.option('un', configuration.un);
    Settings.option('pw', configuration.pw);
});

/**
 * Salesforce login function
 *
 * Arguments: success (function)   Function to call upon successful login
 *            fail    (function)   Function to call upon failed login
 */
function login(success, fail)
{
    // OAuth login URL
    var url = 'https://login.salesforce.com/services/oauth2/token';

    // Construct the body of the request
    var body = 'grant_type=password' +
                '&client_id=' + AppSettings.clientId +
                '&client_secret=' + AppSettings.clientSecret +
                '&username=' + Settings.option('un') +
                '&password=' + Settings.option('pw');
        
    // Attempt the login and call the success or failiure function
    ajax({ url: url, method: 'post', type: 'text', data: body, 
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        },
        function(data) {
            // Success, store the token
            var obj = JSON.parse(data);
            
            token = obj.access_token;
                        
            console.log('Login successful: ' + token);
            
            success();
        },
        function(error) {
            // Failure!
            var errorText = JSON.stringify(error);
            
            console.log('login failed: ' + errorText);
            
            fail(errorText);
        }
    );
}

/**
 * Load the Approvals via the REST Sevice
 */
function loadApprovals()
{
    // Indicate the status on the main screen
    main.body('Loading ...');
    
    // Create the request
    var req = {
        Username: Settings.option('un'),
    };
        
    console.log('req: ' + JSON.stringify(req));
    
    // Call the REST service and handle the success or failure
    ajax({ url: AppSettings.serviceURLprefix + 'GetWorkItems/', 
          method: 'post', type: 'json', data: req, 
          headers: { 'content-type': 'application/json', 'Authorization' : 'Bearer ' + token },
        },
        function(res) {
            // Success, render the approvals
            console.log('res: ' + JSON.stringify(res));
            
            main.body('Loaded.');
            renderApprovals(res);
        },
        function(error) {
            // Failure!
            var errorText = JSON.stringify(error);
            console.log('request failed: ' + errorText);
            
            main.body('Failed:\n' + errorText);
            main.action('select', 'images/reload16x16.png');
        }
    );
}

/**
 * Render the Approvals
 *
 * Arguments:    res    (object)    JSON Response from the GetWorkItems REST Service
 */
function renderApprovals(res)
{
    // If no work items, change the main window text and return
    if (res.WorkItems.length === 0)
    {
        main.body('Nothing to approve.');
        return;
    }
    
    // Create an array of Menu Items
    var menuItems = [];
    
    // Create the Menu Items from the Work Items returned by the web service
    for (var i = 0; i < res.WorkItems.length; i++)
    {
        var menuItem = { 
            title: res.WorkItems[i].ObjectName, 
            subtitle: res.WorkItems[i].WorkItemName,
            id: res.WorkItems[i].WorkItemId,
            fields: res.WorkItems[i].Fields
        };
        
        menuItems.push(menuItem);
    }
    
    console.log('menuItems=' + JSON.stringify(menuItems));
    
    // Add the Menu Items to the menu
    var menu = new UI.Menu({
        sections: [{
            title: 'Approval List',
            items: menuItems
        }] 
    });

    // Add the on select event to show the Work Item in more detail
    menu.on('select', function(itemSelectEvent){
        showWorkItem(itemSelectEvent);
    });

    // Show the menu window
    menu.show();    
}

/**
 * Show the Work Item in more detail
 *
 * Arguments:    itemSelectEvent    (object)     The menu select event
 */
function showWorkItem(itemSelectEvent)
{
    // Get the menu item from the event
    var menuItem = itemSelectEvent.item;
    
    var bodyText = '';
    
    // Build the card body from the fields returned.
    for (var i = 0; i < menuItem.fields.length; i++)
    {
        bodyText += menuItem.fields[i].Name + ': ' + menuItem.fields[i].Value + '\n';
    }

    // There are several windows that will be created as the item
    // is approved, keep track of them to enable them to be removed
    var windowStack = [];

    // Create the Card
    var detailCard = new UI.Card({
        title: menuItem.title,
        subtitle: menuItem.subtitle,
        body: bodyText,
        scrollable: true,
        action: { 
            select: 'images/rightarrow12x16.png',
            up: 'images/uparrow16x11.png',
            down: 'images/downarrow16x11.png'
        }
    });

    // Add it to the window stack
    windowStack.push(detailCard);
    
    // Add the event handler to proceed to the Approval or Rejection
    detailCard.on('click', 'select', function(){
        approveOrReject(itemSelectEvent, windowStack);
    });
    
    // Show the card
    detailCard.show();
}

/**
 * Approve or Reject the Work Item
 *
 * Arguments:    itemSelectEvent    (object)     The menu select event
 *               windowStack        (array)      The Array of windows relating to this Work Item
 */
function approveOrReject(itemSelectEvent, windowStack)
{
    // Create the Approve or Regject Card
    var approveOrRejectCard = new UI.Card({
        title: 'Approve?',
        action: { 
            up: 'images/approve16x16.png',
            down: 'images/reject16x16.png'
        }
    });
    
    // Add it the stack
    windowStack.push(approveOrRejectCard);
    
    // Add the event handler for the Approval and Rejection
    approveOrRejectCard.on('click', 'up', function(){
        approveItem(itemSelectEvent, true, windowStack);
    });

    approveOrRejectCard.on('click', 'down', function(){
        approveItem(itemSelectEvent, false, windowStack);
    });

    // show the card
    approveOrRejectCard.show();
}

/**
 * Perform the Approve or Reject
 *
 * Arguments:    itemSelectEvent    (object)     The menu select event
 *               approve            (boolean)    True to approve, false to reject
 *               windowStack        (array)      The Array of windows relating to this Work Item
 */
function approveItem(itemSelectEvent, approve, windowStack)
{
    // Get the menu item from the menu event
    var menuItem = itemSelectEvent.item;
    
    // Render the Approved/Rejected icon window
    var iconWindow = renderApproved(approve, windowStack);
    
    // Create the request, from the work item id and the approve/reject boolean
    var req = {
        WorkItemId: menuItem.id,
        Approve: approve
    };
        
    console.log('req: ' + JSON.stringify(req));
    
    // Call the REST service and handle the success or failure
    ajax({ url: AppSettings.serviceURLprefix + 'ApproveWorkItem/', 
          method: 'post', type: 'json', data: req, 
          headers: { 'content-type': 'application/json', 'Authorization' : 'Bearer ' + token },
        },
        function(res) {
            // Success
            console.log('res: ' + JSON.stringify(res));

            // Call the function to clear the icon and hide all the windows in the stack
            iconWindow.hideAll();
            
            // Remove the item form the menu
            itemSelectEvent.section.items.splice(itemSelectEvent.itemIndex, 1);

            // If no items left then hide the menu and change the main window text
            if (itemSelectEvent.section.items.length === 0)
            {
                main.body('Nothing to approve.');
                itemSelectEvent.menu.hide();
                return;
            }
                
        },
        function(error) {
            // Failure!
            var errorText = JSON.stringify(error);
            console.log('request failed: ' + errorText);
            
            // Hide the icon window and render the error
            iconWindow.hide();
            renderError(errorText);
        }
    );
}

/**
 * Render the approved / rejected icon
 *
 * Arguments:    approve        (boolean)    True to show the approve icon, false to show the reject icon
 *               windowStack    (array)      The Array of windows relating to the Work Item
 *
 * Returns:      (object)    The created window
 */
function renderApproved(approve, windowStack)
{
    // Create a new Window
    var win = new UI.Window();

    // Add it to the stack
    windowStack.push(win);
    
    // Assign the image
    var img = approve ? 'images/approve128x128.png' : 'images/reject128x128.png';

    // Create the image
    var image = new UI.Image({
        position: new Vector2(8, 10),
        size: new Vector2(128, 128),
        backgroundColor: 'white',
        image: img,
        compositing: 'invert'
    });
    
    // Add it to the window
    win.add(image);
    
    // Show the window
    win.show();
    
    // Create the hideAll fucntion to remove it
    win.hideAll = function(){
        // Animimate the image down
        var pos = image.position();
        pos.y = 169;
        
        image.animate('position', pos, 300);
        
        // Queue up the removal of the window stack when the
        // animation completes
        image.queue(function(next) {
            hideWindowStack(windowStack);
            next();
        });
    };
    
    // Return the window
    return win;
}

/**
 * Hide the window stack
 *
 * Arguments:    windowStack    (array)      The Array of windows relating to the Work Item
 */
function hideWindowStack(windowStack)
{
    while(windowStack.length > 0)
    {
        var win = windowStack.pop();
        win.hide();
    }
}

/**
 * Render an error
 *
 * Arguments:    err    (string)    The error to render
 */
function renderError(err)
{
    // Create the Card
    var errorCard = new UI.Card({
        title: 'Failed',
        body: err,
        scrollable: true
    });
    
    // Show the card
    errorCard.show();
}
    

// Show the Main Card
main.show();

// Login passing in success and failure functions
login(function(res) {
        // Show connected status
        main.body('Connected.');
        
        // Change the behaviour of the select button to load the approvals
        main.on('click', 'select', function() {
            loadApprovals();
        });
        
        loadApprovals();
    },
    function(errorText) {
        main.body('Failed:\n' + errorText);
    }
);
