<?php
require 'database.php';

if ($conn)
{
    echo json_encode('Connected to database');
}

if (SESSION_METHOD == 'POST')
{
    if (isset($_POST['action']))
    {
        $action = $_POST['action'];

////////////////////////////////////////////////////////////////////////////////////////////////////////

        if ($action == 'create-room')
        {

        }

///////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'join-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'leave-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-lobby')
        {
            
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'message')
        {
            
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

    }
}