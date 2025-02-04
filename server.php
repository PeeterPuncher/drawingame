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
                $room_name = $_POST['room_name'];
                $room_code = $_POST['room_code'];
        
                $sql = "INSERT INTO rooms (name, code) VALUES ('$room_name', '$room_code')";
        
                if (mysqli_query($conn, $sql))
                {
                        return json_encode(['status' => 'success', 'data' => $room_code]);
                }
                else
                {
                        return json_encode(['status' => 'error', 'data' => 'Error creating room']);
                }
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
            return json_encode(['status' => 'success', 'data' => 'php says hi']);
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'message')
        {
            
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

    }
}